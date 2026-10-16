use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};
use std::{fs, path::PathBuf};

fn main() {
    let directory = PathBuf::from(std::env::args().nth(1).expect("release directory required"));
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let key = STANDARD
        .decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap())
        .unwrap();
    let key = PublicKey::decode(std::str::from_utf8(&key).unwrap()).unwrap();
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.join("latest.json")).unwrap()).unwrap();
    let version = manifest["version"].as_str().unwrap();
    assert_eq!(version, config["version"].as_str().unwrap());
    for (platform, entry) in manifest["platforms"].as_object().unwrap() {
        let filename = entry["url"].as_str().unwrap().rsplit('/').next().unwrap();
        assert!(!filename.contains('\\') && !filename.contains(".."));
        let bytes = fs::read(directory.join(filename)).unwrap();
        let signature = STANDARD
            .decode(entry["signature"].as_str().unwrap())
            .unwrap();
        let signature = Signature::decode(std::str::from_utf8(&signature).unwrap()).unwrap();
        key.verify(&bytes, &signature, false)
            .expect("invalid release signature");
        assert!(
            signature
                .trusted_comment()
                .split('\t')
                .any(|field| field == format!("version:{version}"))
        );
        println!("Verified version-bound signature: {platform} / {filename}");
    }
}
