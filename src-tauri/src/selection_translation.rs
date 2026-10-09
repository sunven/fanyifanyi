//! Read only the captured application's focused selection; never access the clipboard.
use std::{ffi::c_void, fmt, ptr};

type CFRef = *const c_void;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum SelectionReadError {
    PermissionRequired,
    NoSelection,
    ReadFailed,
}

impl SelectionReadError {
    pub(crate) fn code(&self) -> &'static str {
        match self {
            Self::PermissionRequired => "permission_required",
            Self::NoSelection => "no_selection",
            Self::ReadFailed => "read_failed",
        }
    }
}

impl fmt::Display for SelectionReadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::PermissionRequired => {
                "请在系统设置中允许辅助功能权限；若列表中没有 fanyifanyi，请点 + 添加应用。"
            }
            Self::NoSelection => "未读取到选中文字，请先选择文字；也可复制后使用复制翻译。",
            Self::ReadFailed => "未能读取选中文字，可复制后使用复制翻译。",
        })
    }
}

fn normalize_selection(text: String) -> Result<String, SelectionReadError> {
    if text.trim().is_empty() {
        Err(SelectionReadError::NoSelection)
    } else {
        Ok(text)
    }
}

#[cfg(target_os = "macos")]
pub(crate) use native::*;

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: CFRef) -> u8;
        fn AXUIElementCreateApplication(pid: i32) -> CFRef;
        fn AXUIElementGetTypeID() -> usize;
        fn AXUIElementSetMessagingTimeout(element: CFRef, seconds: f32) -> i32;
        fn AXUIElementCopyAttributeValue(
            element: CFRef,
            attribute: CFRef,
            value: *mut CFRef,
        ) -> i32;
        fn AXUIElementCopyParameterizedAttributeValue(
            element: CFRef,
            attribute: CFRef,
            parameter: CFRef,
            value: *mut CFRef,
        ) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(value: CFRef);
        fn CFGetTypeID(value: CFRef) -> usize;
        fn CFStringGetTypeID() -> usize;
        fn CFStringCreateWithBytes(
            allocator: CFRef,
            bytes: *const u8,
            length: isize,
            encoding: u32,
            external: u8,
        ) -> CFRef;
        fn CFStringGetLength(value: CFRef) -> isize;
        fn CFStringGetCharacters(value: CFRef, range: CFRange, buffer: *mut u16);
    }

    #[repr(C)]
    struct CFRange {
        location: isize,
        length: isize,
    }

    // Own only references returned by Create/Copy functions.
    struct OwnedCF(CFRef);
    impl Drop for OwnedCF {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0) }
        }
    }

    fn owned(value: CFRef) -> Result<OwnedCF, SelectionReadError> {
        if value.is_null() {
            Err(SelectionReadError::ReadFailed)
        } else {
            Ok(OwnedCF(value))
        }
    }

    fn attribute(name: &str) -> Result<OwnedCF, SelectionReadError> {
        unsafe {
            owned(CFStringCreateWithBytes(
                ptr::null(),
                name.as_ptr(),
                name.len() as isize,
                0x08000100,
                0,
            ))
        }
    }

    pub(super) fn ax_error(code: i32) -> SelectionReadError {
        match code {
            -25211 => SelectionReadError::PermissionRequired,
            -25212 => SelectionReadError::NoSelection,
            _ => SelectionReadError::ReadFailed,
        }
    }

    fn copy_attribute(
        element: CFRef,
        name: &str,
        parameter: Option<CFRef>,
    ) -> Result<OwnedCF, SelectionReadError> {
        let name = attribute(name)?;
        let mut value = ptr::null();
        let status = unsafe {
            match parameter {
                Some(parameter) => AXUIElementCopyParameterizedAttributeValue(
                    element, name.0, parameter, &mut value,
                ),
                None => AXUIElementCopyAttributeValue(element, name.0, &mut value),
            }
        };
        if status != 0 {
            return Err(ax_error(status));
        }
        owned(value)
    }

    fn string_value(value: &OwnedCF) -> Result<String, SelectionReadError> {
        unsafe {
            if CFGetTypeID(value.0) != CFStringGetTypeID() {
                return Err(SelectionReadError::ReadFailed);
            }
            let length = CFStringGetLength(value.0);
            let mut utf16 = vec![0; length as usize];
            CFStringGetCharacters(
                value.0,
                CFRange {
                    location: 0,
                    length,
                },
                utf16.as_mut_ptr(),
            );
            normalize_selection(
                String::from_utf16(&utf16).map_err(|_| SelectionReadError::ReadFailed)?,
            )
        }
    }

    pub fn read_selected_text(pid: i32) -> Result<String, SelectionReadError> {
        unsafe {
            if AXIsProcessTrustedWithOptions(ptr::null()) == 0 {
                return Err(SelectionReadError::PermissionRequired);
            }
        }
        if pid <= 0 {
            return Err(SelectionReadError::ReadFailed);
        }
        let app = unsafe { owned(AXUIElementCreateApplication(pid))? };
        unsafe {
            AXUIElementSetMessagingTimeout(app.0, 0.25);
        }
        // Chromium enables native accessibility when the application role is read.
        let _ = copy_attribute(app.0, "AXRole", None);
        let focused = copy_attribute(app.0, "AXFocusedUIElement", None)?;
        unsafe {
            if CFGetTypeID(focused.0) != AXUIElementGetTypeID() {
                return Err(SelectionReadError::ReadFailed);
            }
            AXUIElementSetMessagingTimeout(focused.0, 0.25);
        }
        match copy_attribute(focused.0, "AXSelectedText", None) {
            Ok(text) => return string_value(&text),
            Err(SelectionReadError::PermissionRequired) => {
                return Err(SelectionReadError::PermissionRequired)
            }
            Err(_) => {}
        }
        // WebKit exposes static webpage selections as opaque text markers. Pass the
        // marker back to the same focused object; never decode or mutate it.
        let range = copy_attribute(focused.0, "AXSelectedTextMarkerRange", None)?;
        let text = copy_attribute(focused.0, "AXStringForTextMarkerRange", Some(range.0))?;
        string_value(&text)
    }

    #[tauri::command]
    pub async fn open_selection_accessibility_settings() -> Result<(), String> {
        let status = std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("无法打开系统设置，请手动进入隐私与安全性 → 辅助功能。".into())
        }
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub(crate) async fn open_selection_accessibility_settings() -> Result<(), String> {
    Err("划词翻译目前仅支持 macOS。".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_selection_is_not_a_translation_request() {
        assert_eq!(
            normalize_selection(" \n\t\u{3000}".into()),
            Err(SelectionReadError::NoSelection)
        );
    }

    #[test]
    fn selection_preserves_unicode_and_internal_formatting() {
        assert_eq!(
            normalize_selection("  hello 世界🦀\nnext line  ".into()),
            Ok("  hello 世界🦀\nnext line  ".into())
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn permission_errors_are_distinct_from_missing_or_unsupported_selection() {
        assert_eq!(native::ax_error(-25211).code(), "permission_required");
        assert_eq!(native::ax_error(-25212).code(), "no_selection");
        assert_eq!(native::ax_error(-25205).code(), "read_failed");
    }
}
