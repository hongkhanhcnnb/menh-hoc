from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


class FakeLiuNian:
    def __init__(self, year, age, ganzhi):
        self.year, self.age, self.ganzhi = year, age, ganzhi

    def getYear(self): return self.year
    def getAge(self): return self.age
    def getGanZhi(self): return self.ganzhi


class FakeDaYun:
    def __init__(self, index, start, age, ganzhi):
        self.index, self.start, self.age, self.ganzhi = index, start, age, ganzhi

    def getIndex(self): return self.index
    def getStartYear(self): return self.start
    def getEndYear(self): return self.start + 9
    def getStartAge(self): return self.age
    def getEndAge(self): return self.age + 9
    def getGanZhi(self): return self.ganzhi
    def getLiuNian(self, n=10):
        return [FakeLiuNian(self.start + i, self.age + i, f"CanChi{i}") for i in range(n)]


class FakeYun:
    def getStartSolar(self):
        return SimpleNamespace(toYmd=lambda: "2000-03-01")

    def getStartYear(self): return 3
    def getStartMonth(self): return 2
    def getStartDay(self): return 1
    def isForward(self): return True
    def getDaYun(self, n=10):
        return [FakeDaYun(0, 1990, 1, ""), FakeDaYun(1, 1992, 3, "Canh Thìn")]


class FakeEightChar:
    def getYearGan(self): return "甲"
    def getYearZhi(self): return "申"
    def getYear(self): return "甲申"
    def getYearWuXing(self): return "木金"
    def getMonthGan(self): return "甲"
    def getMonthZhi(self): return "戌"
    def getMonth(self): return "甲戌"
    def getMonthWuXing(self): return "土土"
    def getDayGan(self): return "乙"
    def getDayZhi(self): return "丑"
    def getDay(self): return "乙丑"
    def getDayWuXing(self): return "土木"
    def getTimeGan(self): return "丁"
    def getTimeZhi(self): return "亥"
    def getTime(self): return "丁亥"
    def getTimeWuXing(self): return "火水"
    def getYun(self, gender, sect):
        self.gender, self.sect = gender, sect
        return FakeYun()

class FakeLunar:
    def getEightChar(self): return FakeEightChar()
    def getYear(self): return 1990
    def getMonth(self): return 5
    def getDay(self): return 23
    def toString(self): return "Ngày âm giả lập"
    def toFullString(self): return "Thông tin lịch âm giả lập"


class FakeSolar:
    @staticmethod
    def fromYmdHms(year, month, day, hour, minute, second):
        return FakeSolar()

    def getLunar(self): return FakeLunar()


class MenhHocTests(unittest.TestCase):
    def test_ziwei_hour_index_mapping(self):
        self.assertEqual(main._ziwei_hour_index("23:30"), 0)
        self.assertEqual(main._ziwei_hour_index("00:30"), 12)
        self.assertEqual(main._ziwei_hour_index("01:00"), 1)
        self.assertEqual(main._ziwei_hour_index("03:00"), 2)
        self.assertEqual(main._ziwei_hour_index("21:30"), 11)

    def test_ziwei_requires_birth_time_and_supported_gender(self):
        profile = main.BirthProfile(birthDate="2004-10-13", birthPlace="Ho Chi Minh City", gender="female")
        result = main.calculate_ziwei(profile)
        self.assertFalse(result["available"])
        self.assertIn("giờ sinh", result["reason"].lower())

    def test_ziwei_engine_adapter_returns_chart_and_conventions(self):
        class FakeChart:
            def to_dict(self):
                return {"solarDate": "2004-10-13", "palaces": [{"name": "Mệnh", "stars": ["Tử Vi"]}]}
            def to_text(self):
                return "Lá số 2004-10-13 · Tử Vi tại Mệnh"
        class FakeAstro:
            def by_solar(self, solar_date, hour_index, gender, language):
                self.args = (solar_date, hour_index, gender, language)
                return FakeChart()
        with patch.object(main, "ZiweiAstro", FakeAstro):
            profile = main.BirthProfile(birthDate="2004-10-13", birthTime="03:30", timeAccuracy="exact", birthPlace="Ho Chi Minh City", gender="female")
            result = main.calculate_ziwei(profile)
        self.assertTrue(result["available"])
        self.assertEqual(result["conventions"]["hourIndex"], 2)
        self.assertIn("Tử Vi tại Mệnh", result["chartText"])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()

        self.old_db = main.DB_PATH
        self.old_data_dir = main.DATA_DIR
        self.old_upload = main.UPLOAD_DIR
        self.old_database_url = main.DATABASE_URL
        self.old_secret = main.SESSION_SECRET
        self.old_rate_buckets = dict(main._RATE_BUCKETS)
        self.old_login_failures = dict(main._LOGIN_FAILURES)

        # Force tests to use isolated SQLite instead of Neon PostgreSQL
        main.DATABASE_URL = ""

        main.DATA_DIR = Path(self.temp.name)
        main.DB_PATH = Path(self.temp.name) / "test.sqlite3"
        main.UPLOAD_DIR = Path(self.temp.name) / "knowledge_files"
        main.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        main.SESSION_SECRET = "test-session-secret"
        main._RATE_BUCKETS.clear()
        main._LOGIN_FAILURES.clear()

        main.init_db()

        self.client_ctx = TestClient(main.app)
        self.client = self.client_ctx.__enter__()

        registration = self.client.post(
            "/api/auth/register",
            json={
                "email": "user@example.com",
                "password": "correct-horse-battery",
                "displayName": "Test User"
            }
        )
        assert registration.status_code == 200, registration.text

    def tearDown(self):
        self.client_ctx.__exit__(None, None, None)

        main.DATABASE_URL = self.old_database_url
        main.DB_PATH = self.old_db
        main.DATA_DIR = self.old_data_dir
        main.UPLOAD_DIR = self.old_upload
        main.SESSION_SECRET = self.old_secret

        main._RATE_BUCKETS.clear()
        main._RATE_BUCKETS.update(self.old_rate_buckets)

        main._LOGIN_FAILURES.clear()
        main._LOGIN_FAILURES.update(self.old_login_failures)

        self.temp.cleanup()

    def test_health_and_frontend_assets(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["ok"])
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/styles.css").status_code, 200)
        self.assertEqual(self.client.get("/app.js").status_code, 200)
        self.assertEqual(self.client.get("/main.py").status_code, 404)
        self.assertEqual(self.client.get("/.env").status_code, 404)
        self.assertEqual(health.headers.get("cache-control"), "no-store")
        self.assertIn("X-Content-Type-Options", self.client.get("/").headers)

    def test_metadata_store_and_updates_endpoint(self):
        items = [{
            "title": "A Study of BaZi", "author": "A. Author", "year": 2025,
            "tradition": "Bát tự Trung Quốc", "type": "book", "source": "Crossref",
            "url": "https://doi.org/10.1234/demo", "license": "Chưa xác minh", "query": "BaZi",
        }]
        self.assertEqual(main._store_discovered_references(items), 1)
        response = self.client.get("/api/library/updates")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"][0]["title"], "A Study of BaZi")
        self.assertEqual(response.json()["items"][0]["tradition"], "Bát tự Trung Quốc")

    def test_knowledge_upload_search_delete_and_backup(self):
        text = b"BaZi Four Pillars: Day Master, Ten Gods, Five Elements and luck cycles.\n" * 6
        response = self.client.post(
            "/api/library/upload",
            data={
                "title": "BaZi Testing Notes", "author": "Test", "tradition": "Bát tự Trung Quốc",
                "license_name": "Public domain", "confirm_rights": "true",
            },
            files={"file": ("bazi.txt", text, "text/plain")},
        )
        self.assertEqual(response.status_code, 200, response.text)
        doc_id = response.json()["id"]
        listing = self.client.get("/api/library").json()["items"]
        self.assertEqual(len(listing), 1)
        search = self.client.get("/api/library/search", params={"q": "BaZi Four Pillars"})
        self.assertEqual(search.status_code, 200)
        self.assertTrue(search.json()["items"])
        backup = self.client.get("/api/library/backup")
        self.assertEqual(backup.status_code, 200)
        archive = zipfile.ZipFile(io.BytesIO(backup.content))
        self.assertIn("manifest.json", archive.namelist())
        manifest = json.loads(archive.read("manifest.json"))
        self.assertEqual(manifest["documents"][0]["id"], doc_id)
        deleted = self.client.delete(f"/api/library/{doc_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get("/api/library").json()["items"], [])

    def test_ai_health_check_uses_server_function(self):
        with patch.object(main, "GEMINI_API_KEY", "not-a-real-key"), patch.object(main, "_gemini_text", return_value="OK"):
            result = self.client.post("/api/ai/test")
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json()["ok"])
        self.assertEqual(result.json()["response"], "OK")

    def test_auth_gate_and_login_cookie(self):
        self.client.post("/api/auth/logout")
        protected = self.client.get("/api/library")
        self.assertEqual(protected.status_code, 401)
        login = self.client.post("/api/auth/login", json={"email": "user@example.com", "password": "correct-horse-battery"})
        self.assertEqual(login.status_code, 200)
        self.assertTrue(self.client.cookies.get(main.SESSION_COOKIE))
        self.assertEqual(self.client.get("/api/library").status_code, 200)

    def test_user_state_backup_import_is_account_scoped(self):
        backup = {"app": "MenhHoc", "version": "1.1.0", "data": {
            "profile": {"displayName": "Hứa Hồng Khanh", "birthDate": "2004-10-13", "birthTime": "22:10",
                "gender": "female", "timeAccuracy": "exact", "birthPlace": "Thành Phố Nam Định, Ninh Binh, Việt Nam",
                "timezone": "Asia/Bangkok", "language": "vi", "latitude": 20.43389, "longitude": 106.17729},
            "journals": [], "library": [], "chart": None, "createdAt": "2026-11-09T11:09:31.448Z"}}
        imported = self.client.post("/api/me/import", json={"data": backup["data"]})
        self.assertEqual(imported.status_code, 200, imported.text)
        saved = self.client.get("/api/me/state").json()["data"]
        self.assertEqual(saved["profile"]["birthDate"], "2004-10-13")
        self.assertEqual(saved["profile"]["birthTime"], "22:10")
        self.client.post("/api/auth/logout")
        self.client.post("/api/auth/register", json={"email": "other@example.com", "password": "another-secure-password", "displayName": "Other"})
        other = self.client.get("/api/me/state").json()["data"]
        self.assertIsNone(other["profile"])
        self.assertEqual(other["journals"], [])

    def test_chart_request_uses_supported_kerykeion_v6_house_codes(self):
        profile = {
            "birthDate": "1990-06-15", "birthPlace": "Hanoi, Vietnam",
            "timezone": "Asia/Ho_Chi_Minh", "latitude": 21.0278, "longitude": 105.8342,
        }
        for code in ("P", "K", "W", "R", "A", "M"):
            request = main.ChartRequest(profile=profile, houseSystem=code)
            self.assertEqual(request.houseSystem, code)
        with self.assertRaises(Exception):
            main.ChartRequest(profile=profile, houseSystem="E")

    def test_analysis_recomputes_chart_on_server(self):
        profile = {
            "birthDate": "1990-06-15", "birthPlace": "Hanoi, Vietnam",
            "timezone": "Asia/Ho_Chi_Minh", "latitude": 21.0278, "longitude": 105.8342,
        }
        expected = {"western": {"system": "server-chart"}, "bazi": {}, "vedic": None}
        with patch.object(main, "calculate_chart_bundle", return_value=expected) as calc, \
             patch.object(main, "_gemini_text", return_value="Báo cáo kiểm thử"), \
             patch.object(main, "search_knowledge", return_value=[]):
            response = self.client.post("/api/analyze", json={
                "profile": profile, "topic": "overview", "journals": [],
                "includeKnowledge": False, "language": "vi", "aiConsent": True,
                "chart": {"western": {"system": "client-forged-chart"}},
            })
        self.assertEqual(response.status_code, 200, response.text)
        calc.assert_called_once()
        self.assertEqual(response.json()["text"], "Báo cáo kiểm thử")

    def test_bazi_han_viet_display_mapping(self):
        self.assertEqual(main._bazi_han_viet("甲申"), "Giáp Thân")
        self.assertEqual(main._bazi_han_viet("木金"), "Mộc Kim")
        self.assertEqual(main._lunar_date_vi(FakeLunar()), "Ngày 23 tháng 5 năm 1990")

    def test_bazi_da_yun_and_annual_years(self):
        profile = main.BirthProfile(
            birthDate="1990-06-15", birthTime="10:30", gender="male", timeAccuracy="exact",
            birthPlace="Hanoi, Vietnam", timezone="Asia/Ho_Chi_Minh", latitude=21.0278, longitude=105.8342,
        )
        with patch.dict(sys.modules, {"lunar_python": SimpleNamespace(Solar=FakeSolar)}):
            result = main.calculate_bazi(profile)
        self.assertEqual(result["pillars"]["hour"]["text"], "Đinh Hợi")
        self.assertEqual(result["pillars"]["year"]["text"], "Giáp Thân")
        self.assertEqual(result["pillars"]["year"]["wuxing"], "Mộc Kim")
        self.assertEqual(result["lunarDate"], "Ngày 23 tháng 5 năm 1990")
        self.assertEqual(len(result["luckCycles"]), 1)
        self.assertEqual(result["luckCycles"][0]["annualYears"][0]["year"], 1992)
        self.assertEqual(result["yun"]["direction"], "Thuận")


    def test_postgres_sql_adapter_translation(self):
        translated = main.PostgresCompat._sql(
            "INSERT OR IGNORE INTO discovered_references(id,title) VALUES(?,?)"
        )
        self.assertEqual(
            translated,
            "INSERT INTO discovered_references(id,title) VALUES(%s,%s) ON CONFLICT DO NOTHING",
        )
        upsert = main.PostgresCompat._sql(
            "INSERT INTO app_meta(meta_key,meta_value) VALUES('last',?) ON CONFLICT(meta_key) DO UPDATE SET meta_value=excluded.meta_value"
        )
        self.assertIn("VALUES('last',%s)", upsert)
        self.assertIn("ON CONFLICT(meta_key) DO UPDATE", upsert)

    def test_vercel_auth_fails_closed_without_secrets(self):
        old_vercel = main.IS_VERCEL
        old_secret_configured = main.SESSION_SECRET_CONFIGURED
        try:
            self.client.post("/api/auth/logout")
            main.IS_VERCEL = True
            main.SESSION_SECRET_CONFIGURED = False
            status = self.client.get("/api/auth/status").json()
            self.assertTrue(status["required"])
            self.assertFalse(status["authenticated"])
            response = self.client.post("/api/auth/register", json={"email": "x@example.com", "password": "long-enough-password"})
            self.assertEqual(response.status_code, 503)
        finally:
            main.IS_VERCEL = old_vercel
            main.SESSION_SECRET_CONFIGURED = old_secret_configured

    def test_vercel_cron_requires_bearer_secret(self):
        old_vercel = main.IS_VERCEL
        old_db = main.DATABASE_URL
        old_cron = main.CRON_SECRET
        try:
            main.IS_VERCEL = True
            main.DATABASE_URL = "postgresql://not-used-in-mocked-cron"
            main.CRON_SECRET = "cron-test-secret"
            denied = self.client.get("/api/cron/weekly-discovery")
            self.assertEqual(denied.status_code, 401)
            with patch.object(main, "run_weekly_discovery", return_value={"checked": 8, "new": 0}):
                allowed = self.client.get(
                    "/api/cron/weekly-discovery",
                    headers={"Authorization": "Bearer cron-test-secret"},
                )
            self.assertEqual(allowed.status_code, 200)
            self.assertTrue(allowed.json()["ok"])
        finally:
            main.IS_VERCEL = old_vercel
            main.DATABASE_URL = old_db
            main.CRON_SECRET = old_cron

if __name__ == "__main__":
    unittest.main()
