#[allow(non_upper_case_globals)]
#[allow(non_camel_case_types)]
#[allow(non_snake_case)]
#[doc(hidden)]
pub mod bindings;

pub mod memory;

const PCM_SIZE: usize = bindings::MINIMP3_MAX_SAMPLES_PER_FRAME as usize;
const WORKLET_AUDIO_FRAME_SIZE: usize = 128;

pub enum DecodeResult {
    Success,
    Skipped,
    Insufficient,
}

#[repr(C)]
pub struct Decoder {
    dec: bindings::mp3dec_t,
    frame: bindings::mp3dec_frame_info_t,

    mp3_data_ptr: *const u8,
    mp3_data_size: i32,
    mp3_data_offset: i32,

    // +----------------------------+
    // |   decoded samples    |*****|
    // +-------^--------------^-----^
    //         |              |     +- `PCM_SIZE`
    //         |              +- `num_samples_in_pcm`
    //         +- `pcm_offset`
    pcm: [f32; PCM_SIZE],
    num_samples_in_pcm: usize,
    pcm_offset: usize,

    left: [f32; WORKLET_AUDIO_FRAME_SIZE],
    right: [f32; WORKLET_AUDIO_FRAME_SIZE],
    out_offset: usize,
}

impl Decoder {
    fn new() -> Self {
        unsafe { std::mem::zeroed() }
    }

    fn set_mp3_data(&mut self, ptr: *const u8, size: i32) {
        self.mp3_data_ptr = ptr;
        self.mp3_data_size = size;
        self.mp3_data_offset = 0;
    }

    fn fill(&mut self) -> usize {
        self.out_offset = 0;
        self.fill_internal();
        if self.out_offset == WORKLET_AUDIO_FRAME_SIZE {
            return WORKLET_AUDIO_FRAME_SIZE;
        }

        self.decode_until_sample();
        self.fill_internal();
        self.out_offset
    }

    fn fill_internal(&mut self) {
        let out_remaining = WORKLET_AUDIO_FRAME_SIZE - self.out_offset;
        let decoded_remaining = self.num_samples_in_pcm - self.pcm_offset;
        if decoded_remaining == 0 {
            return;
        }

        let n = core::cmp::min(decoded_remaining, out_remaining);
        if self.frame.channels == 1 {
            for _ in 0..n {
                self.left[self.out_offset] = self.pcm[self.pcm_offset];
                self.right[self.out_offset] = self.pcm[self.pcm_offset];
                self.out_offset += 1;
                self.pcm_offset += 1;
            }
        } else {
            for _ in 0..n {
                self.left[self.out_offset] = self.pcm[self.pcm_offset];
                self.right[self.out_offset] = self.pcm[self.pcm_offset + 1];
                self.out_offset += 1;
                self.pcm_offset += 2;
            }
        }
    }

    fn decode_until_sample(&mut self) {
        loop {
            match self.decode_frame() {
                DecodeResult::Skipped => (),
                _ => break,
            }
        }
    }

    fn decode_frame(&mut self) -> DecodeResult {
        let samples = unsafe {
            bindings::mp3dec_decode_frame(
                &mut self.dec,
                self.mp3_data_ptr.offset(self.mp3_data_offset as isize),
                self.mp3_data_size - self.mp3_data_offset,
                self.pcm.as_mut_ptr(),
                &mut self.frame,
            )
        };

        self.mp3_data_offset += self.frame.frame_bytes;
        self.num_samples_in_pcm = (samples * self.frame.channels) as usize;
        self.pcm_offset = 0;
        if samples == 0 {
            if self.frame.frame_bytes == 0 {
                DecodeResult::Insufficient
            } else {
                DecodeResult::Skipped
            }
        } else {
            DecodeResult::Success
        }
    }
}

#[no_mangle]
pub extern "C" fn create_decoder() -> *mut Decoder {
    let mut decoder = Box::new(Decoder::new());
    unsafe {
        bindings::mp3dec_init(&mut decoder.dec as *mut _);
    }
    Box::leak(decoder) as *mut _
}

#[no_mangle]
pub extern "C" fn destroy_decoder(dec: *mut Decoder) {
    let _drop = unsafe { Box::from_raw(dec) };
}

#[no_mangle]
pub extern "C" fn set_mp3_data(decoder: *mut Decoder, ptr: *const u8, size: i32) {
    unsafe {
        decoder.as_mut().unwrap().set_mp3_data(ptr, size);
    }
}

#[no_mangle]
pub extern "C" fn process(decoder: *mut Decoder) -> i32 {
    unsafe { decoder.as_mut().unwrap().fill() as i32 }
}

#[no_mangle]
pub extern "C" fn sampling_rate(decoder: *mut Decoder) -> i32 {
    unsafe { decoder.as_mut().unwrap().frame.hz }
}

#[no_mangle]
pub extern "C" fn num_channels(decoder: *mut Decoder) -> i32 {
    unsafe { decoder.as_mut().unwrap().frame.channels }
}

#[no_mangle]
pub extern "C" fn frame_bytes(decoder: *mut Decoder) -> i32 {
    unsafe { decoder.as_mut().unwrap().frame.frame_bytes }
}

#[no_mangle]
pub extern "C" fn pcm(decoder: *mut Decoder) -> *const f32 {
    unsafe { decoder.as_mut().unwrap().pcm.as_ptr() }
}

#[no_mangle]
pub extern "C" fn left_channel(decoder: *mut Decoder) -> *const f32 {
    unsafe { decoder.as_mut().unwrap().left.as_ptr() }
}

#[no_mangle]
pub extern "C" fn right_channel(decoder: *mut Decoder) -> *const f32 {
    unsafe { decoder.as_mut().unwrap().right.as_ptr() }
}
