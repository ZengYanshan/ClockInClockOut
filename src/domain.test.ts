import { describe, expect, it } from 'vitest';
import { classification, defaultShifts, punchDate, dayStats, validateShifts, weekDates, weekTotal, type Punch, type Shift } from './domain';

const morning: Shift = { id: 'a', name: '上午', inStart: '08:50:00', inEnd: '09:10:00', outStart: '11:50:00', outEnd: '12:10:00' };
const afternoon: Shift = { id: 'b', name: '下午', inStart: '13:50:00', inEnd: '14:10:00', outStart: '17:50:00', outEnd: '18:10:00' };
function records(times: string[], date = '2026-11-24'): Punch[] {
    return times.map((time, index) => ({ id: String(index), date, time, source: 'click' }));
}
describe('工时统计', () => {
    it('多班段累加，选最早签到与最晚签退，忽略范围外记录', () => {
        const result = dayStats(records(['08:55:00', '09:01:00', '11:55:00', '12:05:00', '13:55:00', '18:05:00', '22:00:00']), [morning, afternoon]);
        expect(result.total).toBe(26400);
        expect(result.groups[0].start?.time).toBe('08:55:00');
        expect(result.groups[0].end?.time).toBe('12:05:00');
    });
    it('缺卡班段不计入，其他班段照常计算', () => {
        const result = dayStats(records(['09:00:00', '14:00:00', '18:00:00']), [morning, afternoon]);
        expect(result.total).toBe(14400);
        expect(result.groups[0].missing).toBe(true);
    });
    it('包含秒级端点', () => {
        expect(dayStats(records(['08:50:00', '12:10:00']), [morning]).total).toBe(12000);
        expect(dayStats(records(['08:49:59', '12:10:01']), [morning]).total).toBe(0);
    });
    it('修改范围和记录后立即重算', () => {
        const punches = records(['09:00:00', '12:00:00']);
        expect(dayStats(punches, [morning]).total).toBe(10800);
        expect(dayStats(punches.slice(0, 1), [morning]).total).toBe(0);
        expect(dayStats(punches, [{ ...morning, inStart: '09:01:00' }]).total).toBe(0);
        expect(dayStats([...punches, ...records(['12:05:00'])], [morning]).total).toBe(11100);
    });
});
describe('范围校验', () => {
    it('允许多个互不重合班段', () => { expect(validateShifts([morning, afternoon])).toBe(''); });
    it('允许共享端点，拦截逆序及格式错误', () => {
        expect(validateShifts([morning, { ...afternoon, inStart: morning.outEnd }])).toBe('');
        expect(validateShifts([{ ...morning, inEnd: '08:00:00' }])).toContain('起点');
        expect(validateShifts([{ ...morning, inStart: '21:50:00', inEnd: '22:10:00', outStart: '05:50:00', outEnd: '06:10:00' }])).toContain('跨午夜');
        expect(validateShifts([{ ...morning, inStart: '25:00:00' }])).toContain('时、分、秒');
    });
});
describe('本地周汇总', () => {
    it('以周一开始、周日结束并跨月跨年', () => {
        expect(weekDates('2027-01-03')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
        expect(weekDates('2026-11-30')[6]).toBe('2026-12-06');
    });
    it('只累计选中周，包括周日，历史周独立', () => {
        const punches = [...records(['09:00:00', '12:00:00'], '2026-12-28'), ...records(['09:00:00', '12:00:00'], '2027-01-03'), ...records(['09:00:00', '12:00:00'], '2027-01-04')];
        expect(weekTotal(punches, [morning], '2027-01-01')).toBe(21600);
        expect(weekTotal(punches, [morning], '2027-01-04')).toBe(10800);
    });
});

describe('图片预置范围', () => {
    it('三个范围通过校验，交界秒唯一归类', () => {
        expect(validateShifts(defaultShifts)).toBe('');
        for (const [time, label] of [['10:30:00', '上午 · 签退'], ['12:45:00', '下午 · 签到'], ['15:30:00', '下午 · 签退'], ['18:15:00', '晚上 · 签到'], ['21:00:00', '晚上 · 签退'], ['00:30:00', '晚上 · 签退'], ['00:30:01', '范围外 · 不计工时']]) {
            expect(classification(records([time])[0], defaultShifts)).toBe(label);
        }
    });
    it('次日凌晨签退计入前一天，跨周不重复累计', () => {
        const punches = [...records(['18:30:00', '23:00:00'], '2026-11-29'), ...records(['00:30:00'], '2026-11-30')];
        expect(punchDate(punches[2], defaultShifts)).toBe('2026-11-29');
        expect(weekTotal(punches, defaultShifts, '2026-11-29')).toBe(21600);
        expect(weekTotal(punches, defaultShifts, '2026-11-30')).toBe(0);
    });
    it('真正重叠的范围仍被拒绝', () => {
        expect(validateShifts([...defaultShifts, { ...morning, id: 'extra' }])).toContain('重合');
    });
});
