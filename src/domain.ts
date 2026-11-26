export interface Punch { id: string; date: string; time: string; source: 'click' | 'manual'; }
export interface Shift { id: string; name: string; inStart: string; inEnd: string; outStart: string; outEnd: string; }
export interface Data { version: 1; punches: Punch[]; shifts: Shift[]; }

export function localDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localTime(date: Date): string {
    return [date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join(':');
}
export function seconds(time: string): number {
    const [h, m, s] = time.split(':').map(Number);
    return h * 3600 + m * 60 + s;
}
export function duration(value: number): string {
    return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor(value % 3600 / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function weekDates(date: string): string[] {
    const day = new Date(`${date}T12:00:00`);
    day.setDate(day.getDate() - (day.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, index) => {
        const next = new Date(day);
        next.setDate(day.getDate() + index);
        return localDate(next);
    });
}
export const defaultShifts: Shift[] = [
    { id: 'morning', name: '上午', inStart: '06:00:00', inEnd: '10:30:00', outStart: '10:30:00', outEnd: '12:45:00' },
    { id: 'afternoon', name: '下午', inStart: '12:45:00', inEnd: '15:30:00', outStart: '15:30:00', outEnd: '18:15:00' },
    { id: 'evening', name: '晚上', inStart: '18:15:00', inEnd: '21:00:00', outStart: '21:00:00', outEnd: '00:30:00' },
];
function matches(time: string, start: string, end: string, shifts: Shift[]): boolean {
    const inside = start <= end ? time >= start && time <= end : time >= start || time <= end;
    const sharedEnd = time === end && shifts.some(shift => shift.inStart === end || shift.outStart === end);
    return inside && !sharedEnd;
}
export function punchDate(punch: Punch, shifts: Shift[]): string {
    if (shifts.some(shift => shift.outEnd < shift.outStart && matches(punch.time, shift.outStart, shift.outEnd, shifts) && punch.time <= shift.outEnd)) {
        const date = new Date(`${punch.date}T12:00:00`);
        date.setDate(date.getDate() - 1);
        return localDate(date);
    }
    return punch.date;
}
export function validateShifts(shifts: Shift[]): string {
    const ranges: { start: number; end: number; label: string }[] = [];
    for (const shift of shifts) {
        if (!shift.name.trim()) { return '请输入班段名称'; }
        const times = [shift.inStart, shift.inEnd, shift.outStart, shift.outEnd];
        if (times.some(time => !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time))) { return '请填写完整的时、分、秒'; }
        if (shift.inStart > shift.inEnd) { return `${shift.name}：签到范围起点不能晚于终点`; }
        if (shift.inEnd > shift.outStart) { return `${shift.name}：签到范围必须早于签退范围，跨午夜仅支持签退结束时间`; }
        for (const [start, end] of [[shift.inStart, shift.inEnd], [shift.outStart, shift.outEnd]]) {
            if (start === end) { return `${shift.name}：范围起点必须早于终点`; }
            if (start < end) { ranges.push({ start: seconds(start), end: seconds(end), label: shift.name }); }
            else {
                ranges.push({ start: seconds(start), end: 86400, label: shift.name }, { start: 0, end: seconds(end), label: shift.name });
            }
        }
    }
    ranges.sort((a, b) => a.start - b.start);
    for (let index = 1; index < ranges.length; index++) {
        if (ranges[index].start < ranges[index - 1].end) { return `${ranges[index - 1].label}与${ranges[index].label}范围重合`; }
    }
    return '';
}
export function dayStats(punches: Punch[], shifts: Shift[]) {
    const groups = shifts.map(shift => {
        const incoming = punches.filter(p => matches(p.time, shift.inStart, shift.inEnd, shifts)).sort((a, b) => a.time.localeCompare(b.time));
        const offset = (p: Punch) => seconds(p.time) + (shift.outEnd < shift.outStart && p.time <= shift.outEnd ? 86400 : 0);
        const outgoing = punches.filter(p => matches(p.time, shift.outStart, shift.outEnd, shifts)).sort((a, b) => offset(a) - offset(b));
        const start = incoming[0];
        const end = outgoing.at(-1);
        return { shift, start, end, missing: !start || !end, total: start && end ? offset(end) - seconds(start.time) : 0 };
    });
    return { groups, total: groups.reduce((sum, group) => sum + group.total, 0) };
}
export function weekTotal(punches: Punch[], shifts: Shift[], date: string): number {
    return weekDates(date).reduce((sum, day) => sum + dayStats(punches.filter(p => punchDate(p, shifts) === day), shifts).total, 0);
}
export function classification(punch: Punch, shifts: Shift[]): string {
    for (const shift of shifts) {
        if (matches(punch.time, shift.inStart, shift.inEnd, shifts)) { return `${shift.name} · 签到`; }
        if (matches(punch.time, shift.outStart, shift.outEnd, shifts)) { return `${shift.name} · 签退`; }
    }
    return '范围外 · 不计工时';
}

export function todayShiftStatuses(punches: Punch[], shifts: Shift[], now: Date) {
    const today = localDate(now);
    const time = localTime(now);
    const todayRecords = punches.filter(punch => punchDate(punch, shifts) === today);
    return dayStats(todayRecords, shifts).groups.map(({ shift, start, end }) => ({
        shift,
        incomingActive: matches(time, shift.inStart, shift.inEnd, shifts),
        outgoingActive: time >= shift.outStart && matches(time, shift.outStart, shift.outEnd, shifts),
        incoming: start?.time ?? (time < shift.inStart ? '未开启' : '未打卡'),
        outgoing: end?.time ?? (time < shift.outStart ? '未开启' : '未打卡'),
    }));
}
