import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { AttendanceDatabase, setDb } from '$lib/db/database';
import { createClass } from '$lib/db/classes';
import { createStudent } from '$lib/db/students';
import { openSession, recordManualAttendance } from '$lib/db/attendance';
import { buildDailyReport, buildMonthlyReport, buildReportSummary } from '$lib/reports/aggregate';

let db: AttendanceDatabase;

beforeEach(async () => {
	db = new AttendanceDatabase('test-reports');
	setDb(db);
	await db.open();
});

afterEach(async () => {
	await db.delete();
	setDb(null);
});

async function seed() {
	const cls = await createClass({
		name: '8A',
		grade: '8',
		academicYear: '2026/2027',
		semester: 'Ganjil'
	});
	const a = await createStudent({ nis: '1', name: 'Ahmad', classId: cls.id });
	const b = await createStudent({ nis: '2', name: 'Budi', classId: cls.id });

	const session = await openSession({ classId: cls.id, date: '2026-09-30', lateAfter: '07:00' });
	await recordManualAttendance({ sessionId: session.id, studentId: a.id, status: 'present' });
	await recordManualAttendance({ sessionId: session.id, studentId: b.id, status: 'late' });

	const session2 = await openSession({ classId: cls.id, date: '2026-09-29' });
	await recordManualAttendance({ sessionId: session2.id, studentId: a.id, status: 'sick' });

	return { cls, a, b };
}

describe('buildDailyReport', () => {
	it('returns one row per record for the given day', async () => {
		await seed();
		const rows = await buildDailyReport({ classId: undefined, date: '2026-09-30' });
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.name).sort()).toEqual(['Ahmad', 'Budi']);
		expect(rows.find((r) => r.name === 'Ahmad')?.status).toBe('Hadir');
	});

	it('returns nothing for a day with no sessions', async () => {
		await seed();
		expect(await buildDailyReport({ date: '2026-01-01' })).toHaveLength(0);
	});
});

describe('buildMonthlyReport', () => {
	it('aggregates per-student monthly stats including zero-count students', async () => {
		const { cls } = await seed();
		const third = await createStudent({ nis: '3', name: 'Citra', classId: cls.id });
		const rows = await buildMonthlyReport({ classId: cls.id, month: '2026-09' });
		expect(rows).toHaveLength(3);
		const ahmad = rows.find((r) => r.name === 'Ahmad')!;
		expect(ahmad.present).toBe(1);
		expect(ahmad.sick).toBe(1);
		expect(ahmad.percentage).toBeCloseTo(50, 5);

		const citra = rows.find((r) => r.name === 'Citra')!;
		expect(citra.total).toBe(0);
		expect(citra.percentage).toBe(0);
		void third;
	});
});

describe('buildReportSummary', () => {
	it('summarizes counts and percentage for a class', async () => {
		const { cls } = await seed();
		const summary = await buildReportSummary({ classId: cls.id, month: '2026-09' });
		expect(summary.present).toBe(1);
		expect(summary.late).toBe(1);
		expect(summary.sick).toBe(1);
		expect(summary.total).toBe(2);
		expect(summary.className).toBe('8A');
	});
});
