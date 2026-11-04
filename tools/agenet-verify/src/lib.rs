//! Independent verifier for the MuZeBOS evidence ledger (`mb_audit`).
//!
//! It recomputes every link of the exported chain *without* any TypeScript code:
//!   hash_i = SHA-256( JSON.stringify({action,target,detail,createdAt,previousHash}) )
//!   previousHash_0 = "GENESIS", previousHash_i = hash_{i-1}
//! The key order and string escaping match `digest()` in lib/metabos/store.ts.
//! This is a hash-commitment check, not a zero-knowledge proof.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const GENESIS: &str = "GENESIS";
pub const FORMAT: &str = "metabos-evidence-chain/v1";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub seq: u64,
    pub action: String,
    pub target: String,
    pub detail: String,
    pub created_at: String,
    pub previous_hash: String,
    pub hash: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Export {
    pub format: String,
    pub head_hash: Option<String>,
    pub count: usize,
    pub entries: Vec<Entry>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EntryResult {
    pub seq: u64,
    pub ok: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub verifier: &'static str,
    pub method: &'static str,
    pub pass: bool,
    pub count: usize,
    pub first_broken_seq: Option<u64>,
    pub head_hash: Option<String>,
    pub entries: Vec<EntryResult>,
    pub errors: Vec<String>,
}

fn js_str(s: &str) -> String {
    // serde_json escapes ", \\ and C0 controls the same way JSON.stringify does.
    serde_json::to_string(s).expect("string serialises")
}

/// Byte-for-byte the string Node's JSON.stringify produces for the hashed body.
pub fn body_json(e: &Entry) -> String {
    format!(
        "{{\"action\":{},\"target\":{},\"detail\":{},\"createdAt\":{},\"previousHash\":{}}}",
        js_str(&e.action), js_str(&e.target), js_str(&e.detail), js_str(&e.created_at), js_str(&e.previous_hash)
    )
}

pub fn entry_hash(e: &Entry) -> String {
    Sha256::digest(body_json(e).as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn verify(x: &Export) -> Report {
    let mut errors = vec![];
    if x.format != FORMAT { errors.push(format!("unexpected format {:?}", x.format)); }
    if x.count != x.entries.len() { errors.push(format!("count {} != entries {}", x.count, x.entries.len())); }
    let mut previous = GENESIS.to_string();
    let mut first: Option<u64> = None;
    let mut last_seq: Option<u64> = None;
    let mut entries = vec![];
    for e in &x.entries {
        let mut reason = None;
        if let Some(p) = last_seq { if e.seq <= p { reason = Some("seq not increasing".into()); } }
        if reason.is_none() && e.previous_hash != previous { reason = Some("previousHash does not match prior entry".into()); }
        if reason.is_none() && entry_hash(e) != e.hash { reason = Some("hash does not match recomputed SHA-256".into()); }
        // Once one link breaks, every later link is untrusted too.
        if reason.is_none() && first.is_some() { reason = Some("after a broken link".into()); }
        if reason.is_some() && first.is_none() { first = Some(e.seq); }
        entries.push(EntryResult { seq: e.seq, ok: reason.is_none(), reason });
        previous = e.hash.clone();
        last_seq = Some(e.seq);
    }
    let actual_head = x.entries.last().map(|e| e.hash.clone());
    if x.head_hash != actual_head { errors.push("headHash does not match last entry".into()); }
    Report {
        verifier: "agenet-verify",
        method: "hash-commitment (SHA-256 chain), not ZK",
        pass: first.is_none() && errors.is_empty(),
        count: x.entries.len(),
        first_broken_seq: first,
        head_hash: actual_head,
        entries,
        errors,
    }
}
