use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Returns `null` if the data is too small or lacks entropy.
#[napi]
pub async fn fingerprint_buffer(data: Buffer) -> Result<Option<String>> {
    tokio::task::spawn_blocking(move || -> Result<Option<String>> {
        let bytes: &[u8] = &data;
        let tlsh = tlsh2::TlshDefaultBuilder::build_from(bytes);
        match tlsh {
            Some(t) => {
                let hash_bytes = t.hash();
                let hash_str = std::str::from_utf8(&hash_bytes)
                    .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;
                Ok(Some(hash_str.to_owned()))
            }
            None => Ok(None),
        }
    })
    .await
    .map_err(|e| Error::new(Status::GenericFailure, format!("Task join error: {e}")))?
}
