use std::process::Command;

fn main() -> Result<(), Box<dyn std::error::Error>> {
     
    tonic_build::configure()
    .out_dir("./src/proto")
    .compile(
        &["src/proto/pubsub.proto"],
        &["src/proto"],
    )?;
    
    // For other language to generate proto
    Command::new("python3").arg("./src/proto/codegen.py").status().expect("codegen proto");
    
    Ok(())
}