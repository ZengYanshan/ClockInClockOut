import { ref } from 'vue';

export type Page = 'home' | 'records' | 'settings';
export type Modal = 'shift' | 'punch' | 'delete' | null;

export function createNavigation(browser: Window = window) {
    const page = ref<Page>('home');
    const modal = ref<Modal>(null);
    const session = browser.crypto.randomUUID();
    let pending = false;

    function state(isModal = false) {
        return { shikeNavigation: session, page: page.value, modal: isModal };
    }

    browser.history.replaceState(state(), '');

    function onPopState(event: PopStateEvent) {
        pending = false;
        modal.value = null;
        const entry = event.state;
        if (entry?.shikeNavigation !== session) {
            // Entries from before a reload belong to the previous navigation session.
            browser.history.back();
            return;
        }
        if (entry.modal) {
            // Forward navigation must never reopen a discarded or submitted form.
            pending = true;
            browser.history.back();
            return;
        }
        page.value = entry.page;
    }

    browser.addEventListener('popstate', onPopState);

    function navigate(next: Page) {
        if (pending || modal.value || next === page.value) { return; }
        if (next === 'home') {
            pending = true;
            browser.history.back();
            return;
        }
        const switchingTab = page.value !== 'home';
        page.value = next;
        if (switchingTab) { browser.history.replaceState(state(), ''); }
        else { browser.history.pushState(state(), ''); }
    }

    function openModal(next: Exclude<Modal, null>) {
        if (pending || modal.value) { return; }
        browser.history.pushState(state(true), '');
        modal.value = next;
    }

    function closeModal() {
        if (pending || !modal.value) { return; }
        modal.value = null;
        pending = true;
        browser.history.back();
    }

    return {
        page,
        modal,
        navigate,
        openModal,
        closeModal,
        dispose: () => browser.removeEventListener('popstate', onPopState),
    };
}
