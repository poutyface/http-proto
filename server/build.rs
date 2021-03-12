use std::process::Command;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // web api
    Command::new("./codegen.sh").status().expect("gen proto");

    Ok(())
}