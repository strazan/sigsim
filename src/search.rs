use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::str::FromStr;

#[napi(object)]
pub struct SearchResult {
    pub index: u32,
    pub distance: i32,
}

#[napi(object)]
pub struct SearchOptions {
    pub threshold: Option<i32>,
}

const DEFAULT_THRESHOLD: i32 = 30;

fn parse_tlsh(hash: &str) -> Result<tlsh2::TlshDefault> {
    tlsh2::TlshDefault::from_str(hash)
        .map_err(|_| Error::new(Status::InvalidArg, format!("Invalid TLSH hash: {hash}")))
}

/// Returns 0 for identical fingerprints, higher values for more different ones.
#[napi]
pub fn tlsh_distance(a: String, b: String) -> Result<i32> {
    let ta = parse_tlsh(&a)?;
    let tb = parse_tlsh(&b)?;
    Ok(ta.diff(&tb, true))
}

/// Default threshold is 30 (lower = stricter).
#[napi]
pub fn tlsh_similar(a: String, b: String, options: Option<SearchOptions>) -> Result<bool> {
    let threshold = options.and_then(|o| o.threshold).unwrap_or(DEFAULT_THRESHOLD);
    let distance = tlsh_distance(a, b)?;
    Ok(distance <= threshold)
}

/// Returns matches sorted by distance (ascending).
#[napi]
pub fn tlsh_search(
    needle: String,
    haystack: Vec<String>,
    options: Option<SearchOptions>,
) -> Result<Vec<SearchResult>> {
    let threshold = options.and_then(|o| o.threshold).unwrap_or(DEFAULT_THRESHOLD);
    let tn = parse_tlsh(&needle)?;

    let mut results: Vec<_> = haystack
        .iter()
        .enumerate()
        .filter_map(|(i, h)| {
            let th = parse_tlsh(h).ok()?;
            let dist = tn.diff(&th, true);
            if dist <= threshold {
                Some(SearchResult {
                    index: i as u32,
                    distance: dist,
                })
            } else {
                None
            }
        })
        .collect();

    results.sort_by_key(|r| r.distance);
    Ok(results)
}
