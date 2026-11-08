"""Guarded fixture client tests: no Docker, real API, provider calls or private settings."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('local_fixtures', Path(__file__).with_name('local-fixtures.py'))
fixtures = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixtures)

def manifest(seeded=True):
    return {'environment': 'LOCAL_FIXTURE', 'namespace': 'local-ops-v1', 'version': 1, 'seededAt': '2026-11-08T10:00:00.123456789Z' if seeded else None,
        'accounts': [{'id': 'fixture-customer', 'name': 'Local customer', 'email': 'customer@fixture.invalid', 'roles': ['CUSTOMER'], 'purpose': 'Order owner'}],
        'scenarios': [{'id': 'fixture-pickup', 'title': 'Local pickup', 'summary': 'Recorded local parcel', 'category': 'relay', 'resourceIds': {'parcelId': 'fixture-parcel'}, 'nextActions': ['Open the parcel'], 'credentials': {'pickupCode': '123456'}}],
        'note': 'Local practice only; no real payments.'}

class FakeClient:
    def __init__(self, fail_seed=False, enabled=True):
        self.calls = []; self.fail_seed = fail_seed; self.enabled = enabled
    def request(self, path, method='GET', body=None, access_token=None):
        self.calls.append((path, method, body, access_token))
        if path.endswith('development-access'): return {'enabled': self.enabled, 'mode': 'LOCAL_DEVELOPMENT' if self.enabled else None}
        if path.endswith('development-session'): return {'accessToken': 'DO_NOT_PRINT_ACCESS_TOKEN', 'refreshToken': 'DO_NOT_PRINT_REFRESH_TOKEN_' + 'x' * 32, 'user': {'active': True, 'status': 'ACTIVE', 'roles': ['ADMIN']}}
        if path.endswith('/seed') and self.fail_seed: raise fixtures.FixtureError('Guarded seed refused.')
        if path.endswith('/logout'): return None
        return manifest()

class FixtureClientTest(unittest.TestCase):
    def test_seed_only_empty_server_owned_payload_and_cleanup_token_never_printed(self):
        client = FakeClient()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = fixtures.seed_local_fixtures(client=client)
            fixtures.print_summary(result)
        self.assertEqual(['/api/admin-auth/development-access', '/api/admin-auth/development-session', '/api/admin/local-fixtures/seed', '/api/admin/local-fixtures', '/api/auth/logout'], [c[0] for c in client.calls])
        self.assertEqual({}, client.calls[2][2]); self.assertEqual('POST', client.calls[2][1])
        self.assertEqual(fixtures.DEVICE_ID, client.calls[1][2]['deviceId'])
        self.assertNotIn('DO_NOT_PRINT', output.getvalue()); self.assertNotIn('123456', output.getvalue())
        self.assertIn('1 accounts, 1 scenarios', output.getvalue())

    def test_unavailable_capability_never_attempts_session_or_seed(self):
        client = FakeClient(enabled=False)
        with self.assertRaises(fixtures.FixtureError): fixtures.seed_local_fixtures(client=client)
        self.assertEqual(1, len(client.calls))

    def test_failed_seed_does_not_retry_or_repair_and_still_logs_out(self):
        client = FakeClient(fail_seed=True)
        with self.assertRaises(fixtures.FixtureError): fixtures.seed_local_fixtures(client=client)
        self.assertEqual(1, sum(c[0].endswith('/seed') for c in client.calls))
        self.assertEqual('/api/auth/logout', client.calls[-1][0])

    def test_read_only_check_does_not_seed_scenarios(self):
        client = FakeClient()
        fixtures.seed_local_fixtures(seed=False, client=client)
        self.assertFalse(any(c[0].endswith('/seed') for c in client.calls))

    def test_wrong_environment_namespace_or_malformed_fields_fail_closed(self):
        mutations = [lambda v: v.update(environment='PRODUCTION'), lambda v: v.update(namespace='other'), lambda v: v.update(version=True), lambda v: v.update(seededAt='2026-02-31T00:00:00Z'), lambda v: v.pop('seededAt'), lambda v: v['accounts'][0].update(email='real@example.com'), lambda v: v['accounts'][0].update(id=None), lambda v: v['accounts'][0].update(roles=[{}]), lambda v: v['scenarios'][0].update(category={}), lambda v: v['scenarios'][0].update(nextActions='not a list')]
        for mutate in mutations:
            value = manifest(); mutate(value)
            with self.subTest(value=value):
                with self.assertRaises(fixtures.FixtureError): fixtures.validate_manifest(value)

    def test_duplicate_and_credential_like_ids_never_reach_guide(self):
        for key in ['accessToken', 'jwtSecret', 'password', 'api_key', 'sessionId', '__proto__']:
            for target in ['credentials', 'resourceIds']:
                value = manifest(); value['scenarios'][0][target] = {key: 'do-not-display'}
                with self.assertRaises(fixtures.FixtureError): fixtures.validate_manifest(value)
        value = manifest(); value['accounts'].append(copy.deepcopy(value['accounts'][0]))
        with self.assertRaises(fixtures.FixtureError): fixtures.validate_manifest(value)
        value = manifest(); value['accessToken'] = 'DO_NOT_DISPLAY'
        self.assertNotIn('accessToken', fixtures.validate_manifest(value))

    def test_fixed_transport_origin_no_url_override_and_no_redirect(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return json.dumps(manifest()).encode()
        class Opener:
            def open(self, request, timeout):
                self.request = request; self.timeout = timeout; return Response()
        opener = Opener(); client = fixtures.LocalFixtureClient(opener)
        client.request('/api/admin/local-fixtures', access_token='LOCAL_FIXTURE_TOKEN')
        self.assertEqual('http://127.0.0.1:55840/api/admin/local-fixtures', opener.request.full_url)
        self.assertEqual('http://127.0.0.1:5173', opener.request.get_header('Origin'))
        self.assertEqual('Bearer LOCAL_FIXTURE_TOKEN', opener.request.get_header('Authorization'))
        for route in ['https://remote.example/api', '//remote.example', '/api/payments/webhooks/YAS']:
            with self.assertRaises(fixtures.FixtureError): client.request(route)
        with self.assertRaises(fixtures.FixtureError): fixtures.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://remote.example/private')
        self.assertTrue(any(isinstance(handler, fixtures.NoRedirect) for handler in fixtures.LocalFixtureClient().opener.handlers))

    def test_raw_http_errors_do_not_disclose_response_or_tokens(self):
        class Opener:
            def open(self, request, timeout): raise HTTPError(request.full_url, 409, 'DO_NOT_PRINT_SECRET', {}, io.BytesIO(b'{"message":"DO_NOT_PRINT_SECRET"}'))
        with self.assertRaises(fixtures.FixtureError) as raised: fixtures.LocalFixtureClient(Opener()).request('/api/admin/local-fixtures')
        self.assertNotIn('DO_NOT_PRINT', str(raised.exception)); self.assertIn('HTTP 409', str(raised.exception))

if __name__ == '__main__': unittest.main()
