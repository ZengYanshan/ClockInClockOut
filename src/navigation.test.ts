import { describe, expect, it } from 'vitest';
import { createNavigation } from './navigation';

function setup() {
    const entries: unknown[] = [null, null];
    let index = 1;
    let listener: ((event: PopStateEvent) => void) | undefined;
    const tasks: (() => void)[] = [];
    function move(offset: number) {
        tasks.push(() => {
            const next = index + offset;
            if (next < 0 || next >= entries.length) { return; }
            index = next;
            if (index > 0) { listener?.({ state: entries[index] } as PopStateEvent); }
        });
    }
    const browser = {
        crypto: { randomUUID: () => 'test-session' },
        history: {
            replaceState: (state: unknown) => { entries[index] = state; },
            pushState: (state: unknown) => { entries.splice(index + 1); entries.push(state); index++; },
            back: () => move(-1),
            forward: () => move(1),
        },
        addEventListener: (_: string, callback: typeof listener) => { listener = callback; },
        removeEventListener: () => { listener = undefined; },
    };
    const navigation = createNavigation(browser as unknown as Window);
    return {
        ...navigation,
        browser,
        entries,
        position: () => index,
        flush: () => { while (tasks.length) { tasks.shift()!(); } },
    };
}

describe('手机和浏览器历史返回', () => {
    it.each(['records', 'settings'] as const)('从 %s 返回首页，再返回离开网站', (page) => {
        const app = setup();
        app.navigate(page);
        app.browser.history.back();
        app.flush();
        expect(app.page.value).toBe('home');
        app.browser.history.back();
        app.flush();
        expect(app.position()).toBe(0);
    });

    it.each(['shift', 'punch', 'delete'] as const)('返回先关闭 %s 弹窗，再回首页', (modal) => {
        const app = setup();
        app.navigate('settings');
        app.openModal(modal);
        app.browser.history.back();
        app.flush();
        expect(app.modal.value).toBeNull();
        expect(app.page.value).toBe('settings');
        app.navigate('home');
        app.flush();
        expect(app.page.value).toBe('home');
    });

    it('按钮关闭只退一层，前进不会重新打开失效表单', () => {
        const app = setup();
        app.navigate('records');
        app.openModal('punch');
        app.closeModal();
        app.closeModal();
        app.navigate('home');
        app.flush();
        expect(app.page.value).toBe('records');
        expect(app.position()).toBe(2);
        app.browser.history.forward();
        app.flush();
        expect(app.modal.value).toBeNull();
        expect(app.position()).toBe(2);
        app.navigate('home');
        app.flush();
        app.browser.history.forward();
        app.flush();
        expect(app.page.value).toBe('records');
    });

    it('刷新遗留的历史项不恢复旧弹窗或页面', () => {
        const app = setup();
        app.entries[1] = { shikeNavigation: 'previous-session', page: 'settings', modal: true };
        app.navigate('records');
        app.browser.history.back();
        app.flush();
        expect(app.modal.value).toBeNull();
        expect(app.position()).toBe(0);
    });

    it('相同页面不重复入栈，卸载时移除监听', () => {
        const app = setup();
        app.navigate('home');
        expect(app.entries).toHaveLength(2);
        app.navigate('settings');
        app.navigate('settings');
        expect(app.entries).toHaveLength(3);
        app.dispose();
        app.browser.history.back();
        app.flush();
        expect(app.page.value).toBe('settings');
    });
});
