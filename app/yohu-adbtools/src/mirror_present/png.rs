//! BGRA 截图落 PNG。Win / mac 宿主只提供像素与路径。

pub fn write_bgra_png(path: &str, w: u32, h: u32, bgra: &[u8]) -> Result<(), String> {
    let mut rgba = vec![0u8; bgra.len()];
    for (i, chunk) in bgra.as_chunks::<4>().0.iter().enumerate() {
        rgba[i * 4] = chunk[2];
        rgba[i * 4 + 1] = chunk[1];
        rgba[i * 4 + 2] = chunk[0];
        rgba[i * 4 + 3] = 255;
    }
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut encoder = png::Encoder::new(file, w, h);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&rgba).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bgra_swaps_to_rgba_png() {
        let path = std::env::temp_dir().join(format!(
            "yohu-bgra-{}-{}.png",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let path_s = path.to_str().expect("temp path utf8");
        write_bgra_png(path_s, 1, 1, &[0xFF, 0x00, 0x00, 0x80]).unwrap();
        let file = std::fs::File::open(&path).unwrap();
        let decoder = png::Decoder::new(file);
        let mut reader = decoder.read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!(info.color_type, png::ColorType::Rgba);
        assert_eq!(&buf[..4], &[0x00, 0x00, 0xFF, 0xFF]);
        let _ = std::fs::remove_file(path);
    }
}
