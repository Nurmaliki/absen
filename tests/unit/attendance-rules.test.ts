import { describe, expect, it } from 'vitest';
import {
	aggregateStudentStats,
	attendancePercentage,
	parseClockMinutes,
	resolveTimedStatus,
	summarizeSession,
	unrecordedStudents
} from '$lib/attendance/rules';
import type { AttendanceRecord, Student } from '$lib/types';

function student(id: string, overrides: Partial<Student> = {}): Student {
	return {
		id,
		nis: id,
		name: `Siswa ${id}`,
		classId: 'c1',
		active: true,
		faceRegistered: false,
		createdAt: '',
		updatedAt: '',
		...overrides
	};
}

function record(
	sessionId: string,
	studentId: string,
	status: AttendanceRecord['status']
): AttendanceRecord {
	return {
		id: `${sessionId}-${studentId}`,
		sessionId,
		studentId,
		status,
		method: 'manual',
		createdAt: '',
		updatedAt: ''
	};
}

describe('resolveTimedStatus', () => {
	it('returns present when scan is before the cutoff', () => {
		// 06:59 -> 419 minutes, cutoff 07:00 -> 420
		expect(resolveTimedStatus(419, '07:00')).toBe('present');
	});

	it('returns present exactly at the cutoff (inclusive boundary)', () => {
		expect(resolveTimedStatus(420, '07:00')).toBe('present');
	});

	it('returns late one minute after the cutoff', () => {
		expect(resolveTimedStatus(421, '07:00')).toBe('late');
	});

	it('treats every scan as present when no cutoff is configured', () => {
		expect(resolveTimedStatus(700, undefined)).toBe('present');
	});

	it('ignores a malformed cutoff instead of throwing', () => {
		expect(resolveTimedStatus(700, 'not-a-time')).toBe('present');
	});
});

describe('parseClockMinutes', () => {
	it('parses valid HH:mm', () => {
		expect(parseClockMinutes('07:00')).toBe(420);
		expect(parseClockMinutes('00:00')).toBe(0);
		expect(parseClockMinutes('23:59')).toBe(1439);
	});

	it('rejects invalid input', () => {
		expect(parseClockMinutes('24:00')).toBeNull();
		expect(parseClockMinutes('07:60')).toBeNull();
		expect(parseClockMinutes('7')).toBeNull();
	});
});

describe('summarizeSession', () => {
	const students = [student('s1'), student('s2'), student('s3'), student('s4', { active: false })];

	it('counts each status and leaves unrecorded students out of the absent bucket', () => {
		const records = [record('sess', 's1', 'present'), record('sess', 's2', 'late')];
		const summary = summarizeSession(students, records);
		expect(summary.present).toBe(1);
		expect(summary.late).toBe(1);
		expect(summary.absent).toBe(0);
		expect(summary.unrecorded).toBe(1); // s3 has no record
		expect(summary.total).toBe(3); // inactive s4 excluded
	});

	it('ignores inactive students entirely', () => {
		const summary = summarizeSession([student('s1', { active: false })], []);
		expect(summary.total).toBe(0);
		expect(summary.unrecorded).toBe(0);
	});
});

describe('unrecordedStudents', () => {
	it('returns active students without a record', () => {
		const students = [student('s1'), student('s2'), student('s3', { active: false })];
		const records = [record('sess', 's1', 'present')];
		expect(unrecordedStudents(students, records).map((s) => s.id)).toEqual(['s2']);
	});
});

describe('attendancePercentage', () => {
	it('computes present+late over total', () => {
		expect(
			attendancePercentage({
				present: 20,
				late: 2,
				permission: 1,
				sick: 1,
				absent: 1,
				unrecorded: 0,
				total: 25
			})
		).toBeCloseTo(88, 5);
	});

	it('returns 0 for an empty cohort', () => {
		expect(
			attendancePercentage({
				present: 0,
				late: 0,
				permission: 0,
				sick: 0,
				absent: 0,
				unrecorded: 0,
				total: 0
			})
		).toBe(0);
	});
});

describe('aggregateStudentStats', () => {
	it('aggregates counts and percentage per student', () => {
		const records = [
			record('a', 's1', 'present'),
			record('b', 's1', 'late'),
			record('c', 's1', 'sick'),
			record('a', 's2', 'absent')
		];
		const stats = aggregateStudentStats(records);
		const s1 = stats.get('s1')!;
		expect(s1.present).toBe(1);
		expect(s1.late).toBe(1);
		expect(s1.sick).toBe(1);
		expect(s1.total).toBe(3);
		expect(s1.percentage).toBeCloseTo((2 / 3) * 100, 5);
		expect(stats.get('s2')!.percentage).toBe(0);
	});
});
