"""IPC 巡洋艦硬表面化：TRIPO 模型的稜角被磨圓（泡泡狀）。
流程：匯入 → Remesh(SHARP) 把圓角重建成銳利稜線 → Planar Dissolve 合併共面 → （可再減面）→ 重新展 UV → 從原模型烘焙底色 → 匯出。
用法：python sharpen_ipc.py <輸入.glb> <輸出.glb> [octree深度=7] [dissolve角度=7] [--noBake]"""
import sys, os, math, json, struct
import bpy, bmesh

src, dst = sys.argv[1], sys.argv[2]
args = [a for a in sys.argv[3:] if not a.startswith('--')]
DEPTH = int(args[0]) if len(args) > 0 else 7; DIS = float(args[1]) if len(args) > 1 else 7.0; NOBAKE = '--noBake' in sys.argv
TEX = 2048

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
orig = [o for o in sc.objects if o.type == 'MESH'][0]
empties = [o for o in sc.objects if o.type == 'EMPTY']
for e in empties: e.parent = None
orig.parent = None
bpy.context.view_layer.objects.active = orig
bpy.ops.object.select_all(action='DESELECT'); orig.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print('orig tris', sum(len(p.vertices) - 2 for p in orig.data.polygons), 'dims', tuple(round(x, 2) for x in orig.dimensions))

# ── 1. Remesh SHARP（複製一份）──
work = orig.copy(); work.data = orig.data.copy(); work.name = 'IPC_Sharp'; sc.collection.objects.link(work)
bpy.ops.object.select_all(action='DESELECT'); work.select_set(True); bpy.context.view_layer.objects.active = work
work.data.materials.clear()
m = work.modifiers.new('rm', 'REMESH'); m.mode = 'SHARP'; m.octree_depth = DEPTH; m.scale = 0.95; m.sharpness = 1.0; m.use_remove_disconnected = False; m.use_smooth_shade = False
bpy.ops.object.modifier_apply(modifier='rm')
print('after remesh tris', sum(len(p.vertices) - 2 for p in work.data.polygons))

# ── 2. Planar dissolve：合併共面小面 ──
d = work.modifiers.new('dis', 'DECIMATE'); d.decimate_type = 'DISSOLVE'; d.angle_limit = math.radians(DIS); d.delimit = set()
bpy.ops.object.modifier_apply(modifier='dis')
bm = bmesh.new(); bm.from_mesh(work.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(work.data); bm.free()
print('after dissolve tris', len(work.data.polygons))
for p in work.data.polygons: p.use_smooth = False

if NOBAKE:
    mat = bpy.data.materials.new('IPC_mat'); work.data.materials.append(mat)
else:
    # ── 3. 展 UV ──
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=0.6, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    # ── 4. 從原模型烘焙底色 ──
    img = bpy.data.images.new('ipc_basecolor_baked', TEX, TEX)
    mat = bpy.data.materials.new('IPC_mat'); mat.use_nodes = True; nt = mat.node_tree
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; nt.nodes.active = tn
    nt.links.new(tn.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    work.data.materials.append(mat)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1; sc.cycles.use_denoising = False
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.35; sc.render.bake.max_ray_distance = 0.9
    sc.render.bake.margin = 8; sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = True
    bpy.ops.object.select_all(action='DESELECT'); orig.select_set(True); work.select_set(True); bpy.context.view_layer.objects.active = work
    bpy.ops.object.bake(type='DIFFUSE')
    out_png = os.path.join(os.path.dirname(os.path.abspath(dst)), 'ipc_baked_color.png'); img.filepath_raw = out_png; img.file_format = 'PNG'; img.save()
    print('baked ->', out_png)

# 刪原模型，保留錨點
bpy.data.objects.remove(orig, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects: o.select_set(o.type in ('MESH', 'EMPTY'))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False, export_image_format='JPEG', export_jpeg_quality=88)
print('exported', dst, os.path.getsize(dst), 'tris', len(work.data.polygons))
