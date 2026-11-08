"""No Docker/server/provider operations: focused isolation and persisted-fixture safety."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import stat
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("local_workspace", Path(__file__).with_name("local-workspace.py"))
workspace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workspace)


class LocalWorkspaceTest(unittest.TestCase):
    def test_production_and_tool_injection_environment_is_removed(self):
        actual = workspace.clean_environment({"HOME": "/home/developer", "PATH": "/usr/bin", "SPRING_CONFIG_LOCATION": "/prod/secret", "JWT_SECRET": "not-for-this-workspace", "YAS_TOGO_API_KEY": "private", "JAVA_TOOL_OPTIONS": "-Dspring.profiles.active=prod", "NODE_OPTIONS": "--require=untrusted", "DOCKER_HOST": "tcp://remote:2376", "VITE_SEQUO_API_BASE_URL": "https://remote"})
        self.assertEqual({"HOME": "/home/developer", "PATH": "/usr/bin"}, actual)

    def test_keys_are_private_persistent_distinct_and_not_repaired(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            first = workspace.load_settings(path)
            self.assertEqual(first, workspace.load_settings(path))
            self.assertEqual(0o600, stat.S_IMODE((path / "settings.json").stat().st_mode))
            self.assertEqual(4, len({first[k] for k in ("databasePassword", "jwtSecret", "notificationSecret", "adminCodeSecret")}))
            broken = dict(first, jwtSecret="unsafe")
            (path / "settings.json").write_text(json.dumps(broken))
            with self.assertRaises(workspace.WorkspaceError):
                workspace.load_settings(path)
            self.assertEqual(broken, json.loads((path / "settings.json").read_text()))

    def test_permissive_or_symlink_settings_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            workspace.load_settings(path)
            (path / "settings.json").chmod(0o644)
            with self.assertRaises(workspace.WorkspaceError):
                workspace.load_settings(path)
            (path / "settings.json").unlink()
            other = path / "other"
            other.write_text("unchanged")
            (path / "settings.json").symlink_to(other)
            with self.assertRaises(workspace.WorkspaceError):
                workspace.load_settings(path)
            self.assertEqual("unchanged", other.read_text())

    def test_configuration_is_loopback_fixture_and_provider_workers_disabled(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = workspace.load_settings(Path(directory))
            props = dict(line.split("=", 1) for line in workspace.api_properties(settings).splitlines() if line and not line.startswith("#"))
            self.assertEqual("", props["spring.config.import"])
            self.assertEqual("local", props["spring.profiles.active"])
            self.assertEqual("127.0.0.1", props["server.address"])
            self.assertEqual("NONE", props["server.forward-headers-strategy"])
            self.assertEqual("8MB", props["spring.servlet.multipart.max-file-size"])
            self.assertEqual("9MB", props["spring.servlet.multipart.max-request-size"])
            self.assertEqual("jdbc:postgresql://127.0.0.1:55924/sequo_admin_dev", props["spring.datasource.url"])
            self.assertEqual("validate", props["spring.jpa.hibernate.ddl-auto"])
            self.assertEqual("true", props["spring.flyway.enabled"])
            self.assertEqual("true", props["sequo.admin.local-fixtures.enabled"])
            self.assertEqual("true", props["sequo.auth.local-mobile-access.enabled"])
            self.assertEqual("sequo-api-local-admin-fixture", props["sequo.auth.jwt.issuer"])
            self.assertEqual("sequo-admin-local-fixture", props["sequo.auth.jwt.audience"])
            self.assertEqual("LOCAL_FIXTURE", props["sequo.admin.local-access.environment"])
            self.assertEqual("false", props["sequo.notifications.outbox-worker.enabled"])
            self.assertEqual("false", props["sequo.settlements.eligibility-scheduler.enabled"])
            self.assertEqual("false", props["sequo.relay.delayed-parcel-scheduler.enabled"])
            self.assertEqual("0", props["sequo.referrals.credit-cfa"])

    def test_generated_private_vite_proxy_is_fixed_and_preserves_browser_origin(self):
        admin = Path('/fixture/sequo-admin')
        with patch.dict(os.environ, {
            'VITE_SEQUO_API_BASE_URL': 'https://remote.invalid',
            'HTTP_PROXY': 'http://remote.invalid',
        }):
            config = workspace.generated_vite_config(admin)
        self.assertTrue(config.startswith('import base from "/fixture/sequo-admin/vite.config.ts";\n'))
        local = json.loads(config.split('const local = ', 1)[1].split(';\n', 1)[0])
        self.assertEqual(str(admin), local['root'])
        self.assertFalse(local['envDir'])
        self.assertEqual({
            'host': '127.0.0.1', 'port': 5173, 'strictPort': True,
            'proxy': {
                path: {'target': 'http://127.0.0.1:55840', 'changeOrigin': True, 'xfwd': False}
                for path in ('/api', '/relay-operator.html', '/relay-operator.js')
            },
        }, local['server'])
        # No Origin/forwarded header injection, arbitrary targets or unrelated paths.
        self.assertNotIn('headers', config)
        self.assertNotIn('rewrite', config)
        self.assertNotIn('remote.invalid', config)
        self.assertTrue(config.endswith('export default {...base, ...local};\n'))

    def test_check_with_optional_fixture_flag_still_does_not_seed_or_read_private_settings(self):
        with patch.object(workspace, 'prerequisites', return_value=Path('/fixture/jdk21')), patch.object(workspace, 'run_fixture_seed') as seed, patch.object(workspace, 'load_settings') as private:
            self.assertEqual(0, workspace.main(['--check', '--with-fixtures']))
            seed.assert_not_called()
            private.assert_not_called()

    def test_cleanup_stops_only_the_process_started_by_launcher(self):
        with tempfile.TemporaryDirectory() as directory:
            processes = workspace.Processes()
            child = processes.start([workspace.sys.executable, '-c', 'import time; time.sleep(60)'],
                                    Path(directory), workspace.clean_environment(), Path(directory) / 'child.log')
            processes.stop()
            self.assertIsNotNone(child.poll())

    def test_busy_port_is_never_replaced(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            with self.assertRaises(workspace.WorkspaceError):
                workspace.require_free_port(listener.getsockname()[1])


if __name__ == "__main__":
    unittest.main()
