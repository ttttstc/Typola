//! RAII guard that records a Tauri command's wall-clock cost.
//!
//! Enable with `--features perf-log`:
//!   cargo build --features perf-log
//!   TYPOLA_PERF_LOG=1 ./typola.exe
//!
//! Without the feature, the guard is a no-op (`Instant::now()` cost
//! is ~5 ns on x86_64 — acceptable; if it ever shows up in a hot
//! path, gate the constructor call too).
//!
//! Output is one line per drop, written to stderr so it is captured
//! by the Tauri log plugin and by the parent's stdout without
//! interfering with structured logging:
//!
//!   perf:read_opened_document cost_ms=12.34
//!
//! Consumers (CI, local profiling) can grep for `^perf:`.

use std::time::Instant;

#[allow(dead_code)] // fields are read only by the feature-gated Drop impl below
pub struct PerfGuard {
    label: &'static str,
    start: Instant,
}

impl PerfGuard {
    #[inline]
    pub fn new(label: &'static str) -> Self {
        Self {
            label,
            start: Instant::now(),
        }
    }
}

#[cfg(feature = "perf-log")]
impl Drop for PerfGuard {
    fn drop(&mut self) {
        let cost_ms = self.start.elapsed().as_secs_f64() * 1000.0;
        eprintln!("perf:{} cost_ms={:.2}", self.label, cost_ms);
    }
}

#[cfg(not(feature = "perf-log"))]
impl Drop for PerfGuard {
    #[inline]
    fn drop(&mut self) {
        // feature off: no measurement, no allocation, no syscall
    }
}
