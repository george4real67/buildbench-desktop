use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};

#[test]
fn pinned_key_accepts_signed_content_and_rejects_modified_content() {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let key = STANDARD
        .decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap())
        .unwrap();
    let key = PublicKey::decode(std::str::from_utf8(&key).unwrap()).unwrap();
    let signature = STANDARD
        .decode(include_str!("fixtures/update.txt.sig").trim())
        .unwrap();
    let signature = Signature::decode(std::str::from_utf8(&signature).unwrap()).unwrap();
    key.verify(include_bytes!("fixtures/update.txt"), &signature, false)
        .unwrap();
    assert!(key.verify(b"tampered update", &signature, false).is_err());
}
