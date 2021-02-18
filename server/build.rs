use std::process::Command;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    //tonic_build::compile_protos("proto/helloworld.proto")?;
     
    tonic_build::configure()
    .out_dir("./proto")
    .compile(
        &["proto/pubsub.proto"],
        &["proto"],
    )?;
    
    // For other language to generate proto
    Command::new("python3").arg("./proto/codegen.py").status().expect("codegen proto");
    

    // web api
    Command::new("./codegen.sh").status().expect("gen proto");

    Ok(())
}