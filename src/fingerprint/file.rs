use crate::common::read_file;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;

#[inline]
fn fingerprint_file_sync(path: &str) -> Result<Option<String>> {
    let file_data = read_file(path)?;
    let bytes = file_data.as_bytes();

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
}

#[napi]
pub async fn fingerprint_file(path: String) -> Result<Option<String>> {
    tokio::task::spawn_blocking(move || fingerprint_file_sync(&path))
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Task join error: {e}")))?
}

#[napi]
pub async fn fingerprint_files(paths: Vec<String>) -> Result<Vec<Option<String>>> {
    tokio::task::spawn_blocking(move || {
        paths
            .par_iter()
            .map(|p| fingerprint_file_sync(p))
            .collect::<Result<Vec<_>>>()
    })
    .await
    .map_err(|e| Error::new(Status::GenericFailure, format!("Task join error: {e}")))?
}
