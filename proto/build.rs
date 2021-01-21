use std::{
    process::Command,
};
use glob::glob;


fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=./gen_proto.sh");
    println!("cargo:rerun-if-changed=./src/lib.rs");

    for entry in glob("./src/*.proto").expect("Failed to read glob pattern") {
        match entry {
            Ok(path) => println!("cargo:rerun-if-changed={:?}", path.display()),
            Err(e) => println!("{:?}", e),
        }
    }

    println!("cargo:warning=generate proto file");
    
    Command::new("./gen_proto.sh").status().expect("gen proto");
}