#[no_mangle]
pub extern "C" fn malloc(size: usize) -> *mut u8 {
    let align = std::mem::align_of::<usize>();
    match std::alloc::Layout::from_size_align(size, align) {
        Ok(layout) => unsafe {
            if layout.size() > 0 {
                let ptr = std::alloc::alloc(layout);
                ptr
            } else {
                align as *mut u8
            }
        },
        Err(_) => std::process::abort(),
    }
}

#[no_mangle]
pub extern "C" fn free(ptr: *mut u8, size: usize) {
    if size == 0 {
        return;
    }
    let align = std::mem::align_of::<usize>();
    unsafe {
        let layout = std::alloc::Layout::from_size_align_unchecked(size, align);
        std::alloc::dealloc(ptr, layout);
    }
}
