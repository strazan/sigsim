use std::path::Path;
use std::{fs, io};

/// Minimum file size before preferring memory-mapped I/O.
pub const MMAP_THRESHOLD: u64 = 1024 * 1024; // 1 MB

#[derive(Debug, thiserror::Error)]
pub enum SigsimError {
    #[error("ENOENT: {0}")]
    NotFound(String),

    #[error("{0}")]
    Io(#[from] io::Error),
}

impl From<SigsimError> for napi::Error {
    fn from(err: SigsimError) -> Self {
        napi::Error::new(napi::Status::GenericFailure, err.to_string())
    }
}

pub enum FileData {
    Mmap(memmap2::Mmap, u64),
    Buf(Vec<u8>, u64),
}

impl FileData {
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Self::Mmap(mmap, _) => mmap,
            Self::Buf(buf, _) => buf,
        }
    }

    pub fn size(&self) -> u64 {
        match self {
            Self::Mmap(_, size) | Self::Buf(_, size) => *size,
        }
    }
}

pub fn read_file(path: &str) -> Result<FileData, SigsimError> {
    let file_path = Path::new(path);

    let metadata = fs::metadata(file_path).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            SigsimError::NotFound(path.to_owned())
        } else {
            SigsimError::Io(e)
        }
    })?;

    let size = metadata.len();

    if size >= MMAP_THRESHOLD {
        let file = fs::File::open(file_path)?;
        // SAFETY: The file handle is held open for the lifetime of the mmap.
        // Concurrent modification of the underlying file is undefined behavior.
        let mmap = unsafe { memmap2::Mmap::map(&file)? };
        Ok(FileData::Mmap(mmap, size))
    } else {
        let data = fs::read(file_path)?;
        Ok(FileData::Buf(data, size))
    }
}
