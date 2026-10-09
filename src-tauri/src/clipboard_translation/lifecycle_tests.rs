use super::*;
use std::cell::RefCell;

struct Fake<'a> {
    state: &'a Mutex<Sessions>,
    trace: RefCell<Vec<&'static str>>,
    fail: RefCell<Option<&'static str>>,
    focused: bool,
    screenshot: bool,
    deferred_destroy: bool,
}

impl<'a> Fake<'a> {
    fn new(state: &'a Mutex<Sessions>) -> Self {
        Self {
            state,
            trace: RefCell::new(vec![]),
            fail: RefCell::new(None),
            focused: true,
            screenshot: false,
            deferred_destroy: false,
        }
    }
    fn step(&self, name: &'static str) -> Result<(), String> {
        assert!(
            self.state.try_lock().is_ok(),
            "native calls must not hold session lock"
        );
        self.trace.borrow_mut().push(name);
        if *self.fail.borrow() == Some(name) {
            Err(name.into())
        } else {
            Ok(())
        }
    }
}

impl LifecycleAdapter for Fake<'_> {
    fn focus_screenshot(&self) -> Result<bool, String> {
        self.step("screenshot")?;
        Ok(self.screenshot)
    }
    fn popup_focused(&self) -> bool {
        self.step("focused").unwrap();
        self.focused
    }
    fn capture(&self, selection: bool) -> CapturedSource {
        self.step(if selection { "selection" } else { "clipboard" })
            .unwrap();
        CapturedSource {
            text: "text".into(),
            error: None,
            permission_required: false,
            origin: Some(Origin {
                pid: 7,
                launched_at: 1.0,
                window_label: None,
            }),
        }
    }
    fn ensure_popup(&self, _: u64) -> Result<(), String> {
        self.step("build")
    }
    fn position(&self) -> Result<(), String> {
        self.step("position")
    }
    fn emit(&self, _: u64) -> Result<(), String> {
        self.step("emit")
    }
    fn show(&self) -> Result<(), String> {
        self.step("show")
    }
    fn focus(&self) -> Result<(), String> {
        self.step("focus")
    }
    fn destroy(&self) -> Result<bool, String> {
        self.step("destroy")?;
        Ok(!self.deferred_destroy)
    }
    fn restore(&self, _: Origin) {
        self.step("restore").unwrap();
    }
}

#[test]
fn lifecycle_orders_capture_display_and_confirmed_close() {
    let state = Mutex::new(Sessions::default());
    let native = Fake::new(&state);
    start_lifecycle(&state, &native, false).unwrap();
    let id = state.lock().unwrap().current.as_ref().unwrap().id;
    close_lifecycle(&state, &native, true, Some(id)).unwrap();
    assert_eq!(
        *native.trace.borrow(),
        [
            "screenshot",
            "clipboard",
            "build",
            "position",
            "emit",
            "show",
            "focus",
            "focused",
            "destroy",
            "restore"
        ]
    );
    assert!(state.lock().unwrap().current.is_none());
}

#[test]
fn opening_faults_cancel_except_position_and_focus() {
    for fault in ["build", "position", "emit", "show", "focus"] {
        let state = Mutex::new(Sessions::default());
        let native = Fake::new(&state);
        *native.fail.borrow_mut() = Some(fault);
        let result = start_lifecycle(&state, &native, false);
        let keeps_result = matches!(fault, "position" | "focus");
        assert_eq!(
            state.lock().unwrap().current.is_some(),
            keeps_result,
            "{fault}"
        );
        assert_eq!(result.is_ok(), fault == "position", "{fault}");
        assert_eq!(
            native.trace.borrow().contains(&"destroy"),
            !keeps_result,
            "{fault}"
        );
    }
}

#[test]
fn failed_destroy_cancels_history_and_retains_retry_and_focus() {
    let state = Mutex::new(Sessions::default());
    let native = Fake::new(&state);
    start_lifecycle(&state, &native, false).unwrap();
    let id = state.lock().unwrap().current.as_ref().unwrap().id;
    *native.fail.borrow_mut() = Some("destroy");
    assert!(close_lifecycle(&state, &native, true, Some(id)).is_err());
    assert_eq!(
        with_session_state(&state, id, || -> Result<(), String> {
            panic!("late history")
        })
        .unwrap(),
        None
    );
    assert!(state.lock().unwrap().pending_cleanup.is_some());
    assert!(!native.trace.borrow().contains(&"restore"));
    *native.fail.borrow_mut() = None;
    close_lifecycle(&state, &native, false, Some(id)).unwrap();
    assert!(state.lock().unwrap().pending_cleanup.is_none());
    assert_eq!(native.trace.borrow().last(), Some(&"restore"));
}

#[test]
fn deferred_destroy_blocks_capture_and_old_events_cannot_clear_new_session() {
    let state = Mutex::new(Sessions::default());
    let mut native = Fake::new(&state);
    native.deferred_destroy = true;
    start_lifecycle(&state, &native, false).unwrap();
    let generation = state.lock().unwrap().popup_generation.unwrap();
    close_lifecycle(&state, &native, true, None).unwrap();
    native.trace.borrow_mut().clear();
    assert!(start_lifecycle(&state, &native, false).is_err());
    assert!(!native.trace.borrow().contains(&"clipboard"));
    assert!(!native.trace.borrow().contains(&"restore"));
    popup_destroyed(&state, &native, generation).unwrap();
    start_lifecycle(&state, &native, false).unwrap();
    let id = state.lock().unwrap().current.as_ref().unwrap().id;
    popup_destroyed(&state, &native, generation).unwrap();
    assert_eq!(state.lock().unwrap().current.as_ref().unwrap().id, id);
}

#[test]
fn same_text_reuses_session_stale_close_and_exclusions_do_nothing() {
    let state = Mutex::new(Sessions::default());
    let native = Fake::new(&state);
    start_lifecycle(&state, &native, false).unwrap();
    let id = state.lock().unwrap().current.as_ref().unwrap().id;
    native.trace.borrow_mut().clear();
    start_lifecycle(&state, &native, false).unwrap();
    assert_eq!(state.lock().unwrap().current.as_ref().unwrap().id, id);
    assert!(!native.trace.borrow().contains(&"position"));
    native.trace.borrow_mut().clear();
    close_lifecycle(&state, &native, true, Some(id + 1)).unwrap();
    assert!(native.trace.borrow().is_empty());
    start_lifecycle(&state, &native, true).unwrap();
    assert!(!native.trace.borrow().contains(&"selection"));
    state.lock().unwrap().screenshot_preparing = true;
    native.trace.borrow_mut().clear();
    start_lifecycle(&state, &native, false).unwrap();
    assert!(native.trace.borrow().is_empty());
}

#[test]
fn selection_capture_never_reads_clipboard_and_screenshot_takes_priority() {
    let state = Mutex::new(Sessions::default());
    let mut native = Fake::new(&state);
    native.focused = false;
    start_lifecycle(&state, &native, true).unwrap();
    assert!(native.trace.borrow().contains(&"selection"));
    assert!(!native.trace.borrow().contains(&"clipboard"));
    native.screenshot = true;
    native.trace.borrow_mut().clear();
    start_lifecycle(&state, &native, false).unwrap();
    assert_eq!(*native.trace.borrow(), ["screenshot"]);
}

#[test]
fn close_command_waits_for_destruction_and_shares_completion() {
    let state = Mutex::new(Sessions::default());
    let mut native = Fake::new(&state);
    native.deferred_destroy = true;
    start_lifecycle(&state, &native, false).unwrap();
    let generation = state.lock().unwrap().popup_generation.unwrap();
    let id = state.lock().unwrap().current.as_ref().unwrap().id;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    close_with_completion(&state, &native, true, Some(id), false, sender);
    assert!(receiver.try_recv().is_err());
    assert!(state.lock().unwrap().current.is_none());
    let (second_sender, second_receiver) = std::sync::mpsc::sync_channel(1);
    close_with_completion(&state, &native, false, Some(id), false, second_sender);
    assert!(second_receiver.try_recv().is_err());
    assert_eq!(
        native
            .trace
            .borrow()
            .iter()
            .filter(|step| **step == "destroy")
            .count(),
        1
    );
    popup_destroyed(&state, &native, generation).unwrap();
    assert_eq!(receiver.try_recv().unwrap(), Ok(()));
    assert_eq!(second_receiver.try_recv().unwrap(), Ok(()));
    assert_eq!(native.trace.borrow().last(), Some(&"restore"));
}

#[test]
fn close_command_reports_destroy_failure_without_waiting_and_can_retry() {
    let state = Mutex::new(Sessions::default());
    let native = Fake::new(&state);
    start_lifecycle(&state, &native, false).unwrap();
    let id = state.lock().unwrap().current.as_ref().unwrap().id;
    *native.fail.borrow_mut() = Some("destroy");
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    close_with_completion(&state, &native, false, Some(id), false, sender);
    assert_eq!(receiver.try_recv().unwrap(), Err("destroy".into()));
    *native.fail.borrow_mut() = None;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    close_with_completion(&state, &native, false, Some(id), false, sender);
    assert_eq!(receiver.try_recv().unwrap(), Ok(()));
    assert!(!native.trace.borrow().contains(&"restore"));
}

#[test]
fn retrying_start_finishes_failed_cleanup_before_capturing_again() {
    let state = Mutex::new(Sessions::default());
    let native = Fake::new(&state);
    start_lifecycle(&state, &native, false).unwrap();
    *native.fail.borrow_mut() = Some("destroy");
    assert!(close_lifecycle(&state, &native, true, None).is_err());
    native.trace.borrow_mut().clear();
    assert!(start_lifecycle(&state, &native, false).is_err());
    assert_eq!(*native.trace.borrow(), ["screenshot", "destroy"]);
    *native.fail.borrow_mut() = None;
    native.trace.borrow_mut().clear();
    assert!(start_lifecycle(&state, &native, false).is_err());
    assert!(!native.trace.borrow().contains(&"clipboard"));
    assert!(state.lock().unwrap().pending_cleanup.is_none());
    start_lifecycle(&state, &native, false).unwrap();
    assert!(native.trace.borrow().contains(&"clipboard"));
}

#[test]
fn screenshot_handoff_revokes_pending_focus_restoration() {
    let state = Mutex::new(Sessions::default());
    let mut native = Fake::new(&state);
    native.deferred_destroy = true;
    start_lifecycle(&state, &native, false).unwrap();
    let generation = state.lock().unwrap().popup_generation.unwrap();
    close_lifecycle(&state, &native, true, None).unwrap();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    close_with_completion(&state, &native, false, None, true, sender);
    assert!(receiver.try_recv().is_err());
    popup_destroyed(&state, &native, generation).unwrap();
    assert_eq!(receiver.try_recv().unwrap(), Ok(()));
    assert!(!native.trace.borrow().contains(&"restore"));
}

#[test]
fn close_restores_only_when_requested_focused_and_source_is_known() {
    for (restore_focus, focused, known_source) in [
        (false, true, true),
        (true, false, true),
        (true, true, false),
    ] {
        let state = Mutex::new(Sessions::default());
        let mut native = Fake::new(&state);
        native.focused = focused;
        start_lifecycle(&state, &native, false).unwrap();
        if !known_source {
            state.lock().unwrap().origin = None;
        }
        close_lifecycle(&state, &native, restore_focus, None).unwrap();
        assert!(!native.trace.borrow().contains(&"restore"));
        assert!(state.lock().unwrap().current.is_none());
    }
}
