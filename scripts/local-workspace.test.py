"""No Docker/server/provider operations: focused isolation and persisted-fixture safety."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import stat
import tempfile
import unittest

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
            self.assertEqual("jdbc:postgresql://127.0.0.1:55924/sequo_admin_dev", props["spring.datasource.url"])
            self.assertEqual("validate", props["spring.jpa.hibernate.ddl-auto"])
            self.assertEqual("true", props["spring.flyway.enabled"])
            self.assertEqual("sequo-api-local-admin-fixture", props["sequo.auth.jwt.issuer"])
            self.assertEqual("sequo-admin-local-fixture", props["sequo.auth.jwt.audience"])
            self.assertEqual("LOCAL_FIXTURE", props["sequo.admin.local-access.environment"])
            self.assertEqual("false", props["sequo.notifications.outbox-worker.enabled"])
            self.assertEqual("false", props["sequo.settlements.eligibility-scheduler.enabled"])
            self.assertEqual("false", props["sequo.relay.delayed-parcel-scheduler.enabled"])
            self.assertEqual("0", props["sequo.referrals.credit-cfa"])

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
