use std::{
    path::{Path, PathBuf},
    env,
    process::Command,
};


fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    println!("cargo:warning=generate proto file");
    
    Command::new("./gen_proto.sh").status().expect("gen proto");
}