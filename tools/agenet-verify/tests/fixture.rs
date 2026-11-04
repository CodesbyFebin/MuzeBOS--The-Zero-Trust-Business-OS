use agenet_verify::{verify, Export};
fn load() -> Export {
    serde_json::from_str(include_str!("fixtures/real-export.json")).expect("fixture parses")
}
#[test]
fn real_export_passes() {
    let x = load();
    assert!(x.count >= 3, "fixture should hold a real multi-row chain");
    let r = verify(&x);
    assert!(r.pass, "{:?}", r);
    assert!(r.entries.iter().all(|e| e.ok));
}
#[test]
fn edited_detail_fails_at_that_entry() {
    let mut x = load();
    x.entries[1].detail.push_str(" (edited)");
    let r = verify(&x);
    assert!(!r.pass);
    assert_eq!(r.first_broken_seq, Some(x.entries[1].seq));
    assert!(r.entries[0].ok && !r.entries[1].ok && r.entries.iter().skip(1).all(|e| !e.ok));
}
#[test]
fn removed_middle_entry_fails() {
    let mut x = load();
    x.entries.remove(1); x.count -= 1;
    let r = verify(&x);
    assert!(!r.pass);
}
#[test]
fn recomputed_hash_without_relinking_fails() {
    let mut x = load();
    x.entries[0].action = "tampered".into();
    x.entries[0].hash = agenet_verify::entry_hash(&x.entries[0]);
    let r = verify(&x);
    assert!(!r.pass, "next entry's previousHash must break");
    assert_eq!(r.first_broken_seq, Some(x.entries[1].seq));
}
#[test]
fn head_hash_mismatch_fails() {
    let mut x = load();
    x.head_hash = Some("00".repeat(32));
    assert!(!verify(&x).pass);
}
