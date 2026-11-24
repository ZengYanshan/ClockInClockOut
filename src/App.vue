<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Fingerprint, Plus, Settings2, ShieldCheck, Trash2, Pencil, X } from 'lucide-vue-next';
import { classification, defaultShifts, punchDate, dayStats, duration, localDate, localTime, validateShifts, weekDates, weekTotal, type Data, type Punch, type Shift } from './domain';

import { createNavigation } from './navigation';

const key = 'shike-data-v1';
const data = ref<Data>({ version: 1, punches: [], shifts: defaultShifts.map(shift => ({ ...shift })) });
const error = ref('');
try {
    const saved = localStorage.getItem(key);
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.version !== 1 || !Array.isArray(parsed.punches) || !Array.isArray(parsed.shifts) || validateShifts(parsed.shifts) || parsed.punches.some((p: Punch) => !p.id || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(p.time))) { throw new Error(); }
        data.value = { ...parsed, shifts: parsed.shifts.length ? parsed.shifts : defaultShifts.map(shift => ({ ...shift })) };
    }
} catch { error.value = '无法读取本机数据，请检查浏览器存储；原数据未被覆盖。'; }
const { page, modal, navigate, openModal, closeModal, dispose } = createNavigation();
onUnmounted(dispose);
const now = ref(new Date());
const timer = window.setInterval(() => { now.value = new Date(); }, 1000);
onUnmounted(() => window.clearInterval(timer));
const today = computed(() => localDate(now.value));
const selectedWeek = ref(localDate(new Date()));
const dates = computed(() => weekDates(selectedWeek.value));
const total = computed(() => weekTotal(data.value.punches, data.value.shifts, today.value));
const shownTotal = computed(() => weekTotal(data.value.punches, data.value.shifts, selectedWeek.value));
const todayPunches = computed(() => data.value.punches.filter(p => p.date === today.value).sort((a, b) => b.time.localeCompare(a.time)));
const days = computed(() => [...dates.value].reverse().filter(date => data.value.punches.some(p => punchDate(p, data.value.shifts) === date)).map(date => {
    const punches = data.value.punches.filter(p => punchDate(p, data.value.shifts) === date).sort((a, b) => a.time.localeCompare(b.time));
    return { date, punches, ...dayStats(punches, data.value.shifts) };
}));
const collapsed = ref<string[]>([]);
const toast = ref('');
let toastTimer = 0;
function notify(message: string) {
    toast.value = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.value = ''; }, 3500);
}
function persist(next: Data): boolean {
    try {
        localStorage.setItem(key, JSON.stringify(next));
        data.value = next;
        error.value = '';
        return true;
    } catch { error.value = '保存失败：请检查浏览器存储权限或剩余空间。'; return false; }
}
function punch() {
    const date = new Date();
    const record: Punch = { id: crypto.randomUUID(), date: localDate(date), time: localTime(date), source: 'click' };
    if (data.value.punches.some(p => p.date === record.date && p.time === record.time)) { notify('这一秒已经打过卡了'); return; }
    if (persist({ ...data.value, punches: [...data.value.punches, record] })) { notify(`打卡成功 · ${record.time}`); }
}
function moveWeek(offset: number) {
    const date = new Date(`${selectedWeek.value}T12:00:00`);
    date.setDate(date.getDate() + offset * 7);
    selectedWeek.value = localDate(date);
}
function pretty(date: string, weekday = false) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', ...(weekday ? { weekday: 'long' as const } : {}) });
}
const formError = ref('');
const shiftForm = ref<Shift>({ id: '', name: '', inStart: '', inEnd: '', outStart: '', outEnd: '' });
const punchForm = ref<Punch>({ id: '', date: '', time: '', source: 'manual' });
const deleting = ref<{ kind: 'shift' | 'punch'; id: string; label: string } | null>(null);
function editShift(shift?: Shift) {
    shiftForm.value = shift ? { ...shift } : { id: crypto.randomUUID(), name: '', inStart: '08:50:00', inEnd: '09:10:00', outStart: '17:50:00', outEnd: '18:10:00' };
    formError.value = '';
    openModal('shift');
}
function editPunch(record?: Punch) {
    punchForm.value = record ? { ...record } : { id: crypto.randomUUID(), date: today.value, time: localTime(new Date()), source: 'manual' };
    formError.value = '';
    openModal('punch');
}
function saveShift() {
    const shifts = [...data.value.shifts.filter(s => s.id !== shiftForm.value.id), { ...shiftForm.value, name: shiftForm.value.name.trim() }];
    formError.value = validateShifts(shifts);
    if (formError.value) { return; }
    if (persist({ ...data.value, shifts })) { closeModal(); notify('时段已保存，历史工时已重新计算'); }
}
function savePunch() {
    const p = { ...punchForm.value, source: 'manual' as const };
    if (!p.date || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(p.time)) { formError.value = '请填写日期和完整的时、分、秒'; return; }
    const current = new Date();
    if (p.date > localDate(current) || (p.date === localDate(current) && p.time > localTime(current))) { formError.value = '不能保存未来的打卡时间'; return; }
    if (data.value.punches.some(item => item.id !== p.id && item.date === p.date && item.time === p.time)) { formError.value = '该日期的这一秒已有打卡记录'; return; }
    if (persist({ ...data.value, punches: [...data.value.punches.filter(item => item.id !== p.id), p] })) { selectedWeek.value = p.date; closeModal(); notify('记录已保存'); }
}
function askDelete(kind: 'shift' | 'punch', id: string, label: string) {
    deleting.value = { kind, id, label };
    openModal('delete');
}
function confirmDelete() {
    const target = deleting.value!;
    const next = target.kind === 'shift' ? { ...data.value, shifts: data.value.shifts.filter(s => s.id !== target.id) } : { ...data.value, punches: data.value.punches.filter(p => p.id !== target.id) };
    if (persist(next)) { closeModal(); notify('已删除，工时已重新计算'); }
}
</script>

<template>
    <div class="app-shell" :class="{ 'home-shell': page === 'home' }">
        <main>
            <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
            <!-- 首页 -->
            <section v-if="page === 'home'" class="home page">
                <!-- 本地时间 -->
                <div class="date-line">{{ now.toLocaleDateString('zh-CN', {
                    year: 'numeric', month: 'long', day:
                        'numeric'
                }) }} <span>{{ now.toLocaleDateString('zh-CN', { weekday: 'long' }) }}</span></div>
                <div class="clock">{{ localTime(now) }}</div>
                <!-- 本周累计打卡时长 -->
                <button class="week-card" @click="selectedWeek = today; navigate('records')">
                    <div class="week-card-top"><span>本周累计打卡时长</span><span>{{ pretty(weekDates(today)[0]) }} — {{
                        pretty(weekDates(today)[6]) }}</span></div>
                    <div class="week-time">{{ duration(total).split(':').slice(0, 2).join(':') }}<span>时 : 分</span>
                        <ChevronRight :size="24" />
                    </div>
                </button>
                <!-- 打卡按钮 -->
                <div class="punch-area"><button class="punch-button" @click="punch"><span>打卡</span></button></div>
                <!-- 设置按钮 -->
                <button class="icon-button" aria-label="时段设置" @click="navigate('settings')">
                    <Settings2 :size="22" />
                </button>
            </section>

            <!-- 打卡记录页 -->
            <section v-else-if="page === 'records'" class="page records">
                <!-- 顶部周 -->
                <div class="week-picker"><button class="icon-button" aria-label="上一周" @click="moveWeek(-1)">
                        <ChevronLeft :size="20" />
                    </button><span>{{ dates[0].replaceAll('-', '.') }} — {{ dates[6].replace('-', '.') }}</span><button
                        class="icon-button" aria-label="下一周" @click="moveWeek(1)">
                        <ChevronRight :size="20" />
                    </button></div>

                <div class="section-heading">
                    <h3>{{ dates.includes(today) ? '本周' : '非本周' }} <button v-if="!dates.includes(today)"
                            class="text-button" @click="selectedWeek = today">回到本周</button></h3><span>累计 <b>{{
                                duration(shownTotal) }}</b></span>
                </div>
                <!-- 周打卡记录 -->
                <!-- 若无打卡记录，显示 -->
                <div v-if="!days.length" class="empty">
                    <CalendarDays :size="38" :stroke-width="1.2" />
                    <h3>这一周还没有打卡</h3><button class="text-button" @click="editPunch()">补一条打卡记录
                        <Plus :size="15" />
                    </button>
                </div>
                <!-- 若有打卡记录，显示 -->
                <article v-for="day in days" :key="day.date" class="day-card"><button class="day-heading"
                        @click="collapsed = collapsed.includes(day.date) ? collapsed.filter(d => d !== day.date) : [...collapsed, day.date]"><strong>{{
                            pretty(day.date, true) }}</strong><span>
                            <button v-if="!collapsed.includes(day.date)" class="small-icon" aria-label="增加记录" @click="editPunch()">
                                <Plus :size="16" />
                            </button>
                            <!-- {{ duration(day.total) }} -->
                            <ChevronRight :size="16" :class="{ rotated: !collapsed.includes(day.date) }" />
                        </span></button>
                    <div v-if="!collapsed.includes(day.date)" class="day-content">
                        <div v-for="p in day.punches" :key="p.id" class="record-row"><span class="record-dot"
                                :class="{ outside: classification(p, data.shifts).startsWith('时段外') }"></span>
                            <div class="record-label">{{ classification(p, data.shifts) }}<small>{{ p.source ===
                                'manual' ? '手动记录' : '即时打卡' }}</small></div><time>{{ p.time }}</time>
                            <button class="small-icon" aria-label="编辑记录" @click="editPunch(p)">
                                <Pencil :size="16" />
                            </button>
                            <button class="small-icon danger" aria-label="删除记录"
                                @click="askDelete('punch', p.id, `${p.date} ${p.time} 的记录`)">
                                <Trash2 :size="16" />
                            </button>
                        </div>
                    </div>
                </article>
            </section>

            <!-- 打卡时段设置页 -->
            <section v-else class="page settings">
                <!-- 返回按钮 -->
                <!-- <button class="text-button" @click="navigate('home')"><ArrowLeft :size="18" /> 返回首页</button> -->

                <!-- 标题 -->
                <div class="settings-intro">
                    <h3>设置打卡时段</h3>
                </div>

                <div v-if="!data.shifts.length" class="empty">
                    <Clock3 :size="38" :stroke-width="1.2" />
                    <h3>添加第一个时段</h3>
                    <p>未设置打卡时段时，仍可正常记录打卡</p>
                </div>
                <article v-for="shift in data.shifts" :key="shift.id" class="shift-card">
                    <div class="shift-heading">
                        <h3>{{ shift.name }}</h3>
                        <div><button class="small-icon" aria-label="编辑时段" @click="editShift(shift)">
                                <Pencil :size="17" />
                            </button><button class="small-icon danger" aria-label="删除时段"
                                @click="askDelete('shift', shift.id, shift.name)">
                                <Trash2 :size="17" />
                            </button></div>
                    </div>
                    <div class="range-row"><span>签到时间</span><time>{{ shift.inStart }} — {{ shift.inEnd }}</time></div>
                    <div class="range-row"><span>签退时间</span><time>{{ shift.outStart }} — {{ shift.outEnd }}</time></div>
                </article>
                <button class="primary-button" @click="editShift()">
                    <Plus :size="20" /> 新增时段
                </button>
            </section>
        </main>
        <Transition name="toast">
            <div v-if="toast" class="toast-message" role="status">
                <Check :size="18" />{{ toast }}
            </div>
        </Transition>
        <div v-if="modal" class="modal-backdrop" @click.self="closeModal()" @keydown.esc="closeModal()">
            <section class="modal" role="dialog" aria-modal="true"
                :aria-label="modal === 'shift' ? '编辑时段' : modal === 'punch' ? '编辑记录' : '确认删除'">
                <header class="modal-header">
                    <h3>{{ modal === 'shift' ? '编辑时段' : modal === 'punch' ? '补卡 / 修改记录' : '确认删除' }}</h3><button
                        class="icon-button" aria-label="关闭" @click="closeModal()">
                        <X :size="22" />
                    </button>
                </header>
                <form v-if="modal === 'shift'" @submit.prevent="saveShift"><label>时段名称<input v-model="shiftForm.name"
                            maxlength="30" placeholder="例如：日间时段" required autofocus></label><label>签到时间<div
                            class="time-inputs"><input v-model="shiftForm.inStart" type="time" step="1" required
                                aria-label="签到开始时间"><span>—</span><input v-model="shiftForm.inEnd" type="time" step="1"
                                required aria-label="签到结束时间"></div></label><label>签退时间<div class="time-inputs"><input
                                v-model="shiftForm.outStart" type="time" step="1" required
                                aria-label="签退开始时间"><span>—</span><input v-model="shiftForm.outEnd" type="time" step="1"
                                required aria-label="签退结束时间"></div></label>
                    <p class="form-hint">时段精确到秒，允许共用端点，交界秒归后一个时段；签退结束时间可跨午夜。</p>
                    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p><button
                        class="primary-button" type="submit">保存时段</button>
                </form>
                <form v-else-if="modal === 'punch'" @submit.prevent="savePunch"><label>打卡日期<input
                            v-model="punchForm.date" type="date" :max="today" required></label><label>打卡时间<input
                            v-model="punchForm.time" type="time" step="1" required></label>
                    <p class="form-hint">手动记录会按当前时段自动归类并重新计算工时。</p>
                    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p><button
                        class="primary-button" type="submit">保存记录</button>
                </form>
                <div v-else>
                    <p class="delete-copy">确定删除「{{ deleting?.label }}」吗？此操作无法撤销，相关工时将重新计算。</p>
                    <div class="confirm-actions"><button class="add-button" @click="closeModal()">取消</button><button
                            class="primary-button delete-button" @click="confirmDelete">确认删除</button></div>
                </div>
                <p v-if="error" class="form-error" role="alert">{{ error }}</p>
            </section>
        </div>
    </div>
</template>
