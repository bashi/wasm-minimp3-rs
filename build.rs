fn main() {
    println!("cargo:rerun-if-changed=bindings.c");

    cc::Build::new()
        .include("include")
        .file("bindings.c")
        .compile("minimp3");
}
