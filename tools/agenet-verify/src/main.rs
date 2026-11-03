use std::io::Read;
/// Usage: agenet-verify [FILE|-]   (reads exported JSON; prints a JSON report; exit 0 pass, 1 fail, 2 bad input)
fn main() {
    let arg = std::env::args().nth(1).unwrap_or_else(|| "-".into());
    let mut buf = String::new();
    let read = if arg == "-" { std::io::stdin().read_to_string(&mut buf).map(|_| ()) } else { std::fs::read_to_string(&arg).map(|s| buf = s) };
    if let Err(e) = read { eprintln!("read error: {e}"); std::process::exit(2); }
    let x: agenet_verify::Export = match serde_json::from_str(&buf) { Ok(x) => x, Err(e) => { eprintln!("invalid export JSON: {e}"); std::process::exit(2); } };
    let r = agenet_verify::verify(&x);
    println!("{}", serde_json::to_string_pretty(&r).unwrap());
    std::process::exit(if r.pass { 0 } else { 1 });
}
