use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Rect { pub x: f64, pub y: f64, pub width: f64, pub height: f64 }
#[derive(Default)]
pub struct PresenterOwner(pub Mutex<Option<String>>);
fn overlap(a: Rect, b: Rect) -> f64 {
    ((a.x + a.width).min(b.x + b.width) - a.x.max(b.x)).max(0.0)
        * ((a.y + a.height).min(b.y + b.height) - a.y.max(b.y)).max(0.0)
}
fn contains(r: Rect, x: f64, y: f64) -> bool { x >= r.x && x < r.x+r.width && y >= r.y && y < r.y+r.height }
pub fn choose_bounds(owner: Rect, monitors: &[Rect], saved: Option<Rect>) -> Rect {
    if let Some(r) = saved { if r.width >= 640.0 && r.height >= 400.0 && monitors.iter().any(|m| overlap(r, *m) >= r.width*r.height/2.0) { return r; } }
    let x = owner.x + owner.width/2.0; let y = owner.y + owner.height/2.0;
    if let Some(m) = monitors.iter().find(|m| !contains(**m, x, y)) {
        return Rect { x:m.x+m.width*0.1, y:m.y+m.height*0.1, width:m.width*0.8, height:m.height*0.8 };
    }
    if let Some(m) = monitors.iter().find(|m| contains(**m, x, y)).or_else(|| monitors.first()) {
        let width = 900.0_f64.min(m.width); let height = 600.0_f64.min(m.height);
        return Rect { x:(owner.x+owner.width).max(m.x).min(m.x+m.width-width), y:owner.y.max(m.y).min(m.y+m.height-height), width, height };
    }
    Rect {x:owner.x+owner.width,y:owner.y,width:900.0,height:600.0}
}
#[tauri::command]
pub fn open_presenter_window(app: AppHandle, owner: String, saved: Option<Rect>) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("presenter") { existing.set_focus().map_err(|e| e.to_string())?; return Ok(()); }
    let window = app.get_webview_window(&owner).ok_or("Owner window is unavailable")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?; let size = window.outer_size().map_err(|e| e.to_string())?;
    let owner_rect = Rect {x:pos.x as f64/scale,y:pos.y as f64/scale,width:size.width as f64/scale,height:size.height as f64/scale};
    let monitors: Vec<Rect> = window.available_monitors().map_err(|e| e.to_string())?.iter().map(|m| { let p=m.position(); let s=m.size(); let f=m.scale_factor(); Rect{x:p.x as f64/f,y:p.y as f64/f,width:s.width as f64/f,height:s.height as f64/f} }).collect();
    let bounds = choose_bounds(owner_rect, &monitors, saved);
    *app.state::<PresenterOwner>().0.lock().map_err(|e| e.to_string())? = Some(owner);
    WebviewWindowBuilder::new(&app, "presenter", WebviewUrl::App("presenter.html".into())).title("Presenter — BugText").position(bounds.x,bounds.y).inner_size(bounds.width,bounds.height).min_inner_size(640.0,400.0).build().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn close_presenter_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("presenter") { w.close().map_err(|e| e.to_string())?; }
    Ok(())
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn placement() {
  let a=Rect{x:0.,y:0.,width:1920.,height:1080.}; let b=Rect{x:1920.,..a}; let owner=Rect{x:100.,y:100.,width:900.,height:700.};
  let saved=Rect{x:2000.,y:50.,width:900.,height:600.}; assert_eq!(choose_bounds(owner,&[a,b],Some(saved)),saved);
  assert_eq!(choose_bounds(owner,&[a,b],None).x,2112.);
  assert_eq!(choose_bounds(owner,&[a],None).x,1000.);
 }
}
