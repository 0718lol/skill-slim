import math
import struct
import zlib

WIDTH = 512
HEIGHT = 512

def create_crisp_logo():
    # 512x512 RGBA image
    img = bytearray(WIDTH * HEIGHT * 4)

    # Outer squircle parameters
    cx, cy = 256.0, 256.0
    hw, hh = 236.0, 236.0
    r = 104.0

    def get_squircle_dist(x, y):
        dx = abs(x - cx)
        dy = abs(y - cy)
        qx = max(0.0, dx - (hw - r))
        qy = max(0.0, dy - (hh - r))
        return r - math.sqrt(qx * qx + qy * qy)

    # Isometric 3D Hexagon / Cube helper
    # Center of cube at (256, 256)
    # Radius = 130
    R = 130.0
    
    # 6 vertices of regular isometric cube outline:
    # 0: Top (0, -R)
    # 1: Top-Right (R * sqrt(3)/2, -R * 0.5)
    # 2: Bottom-Right (R * sqrt(3)/2, R * 0.5)
    # 3: Bottom (0, R)
    # 4: Bottom-Left (-R * sqrt(3)/2, R * 0.5)
    # 5: Top-Left (-R * sqrt(3)/2, -R * 0.5)
    # Center vertex C: (0, 0)
    
    # Let's create an iconic, ultra-sleek design:
    # Three floating isometric layers/plates (representing context/skills)
    # Layer 1 (top), Layer 2 (mid), Layer 3 (bottom)
    # Each plate is an isometric rhombus with rounded corners, stacked with gap.
    # A sleek lightning/laser bolt cuts through them, slimming the stack!
    
    # Plate dimensions:
    # An isometric rhombus: 
    # Points: Top (0, -H), Right (W, 0), Bottom (0, H), Left (-W, 0)
    # W = 140, H = 80
    
    # 3 plates stacked at Y offsets:
    # Top plate: cy - 70
    # Middle plate: cy
    # Bottom plate: cy + 70
    
    # Let's test a point inside a convex polygon:
    def point_in_poly(px, py, poly):
        inside = False
        n = len(poly)
        j = n - 1
        for i in range(n):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
                inside = not inside
            j = i
        return inside

    # Let's define the 3 isometric stacked slabs:
    # Slab 1 (Bottom, darkest): Y center = 310, thickness = 28
    # Slab 2 (Middle): Y center = 250, thickness = 28
    # Slab 3 (Top, most vibrant): Y center = 190, thickness = 28
    
    # Rhombus half-width = 130, half-height = 68
    rw = 130.0
    rh = 68.0

    slabs = [
        # (center_y, thickness, top_color, side_left_color, side_right_color)
        (330, 24, (30, 41, 59), (15, 23, 42), (2, 6, 23)),         # Base: Slate-800
        (260, 24, (79, 70, 229), (67, 56, 202), (55, 48, 163)),     # Mid: Indigo-600
        (190, 24, (6, 182, 212), (14, 165, 233), (2, 132, 199)),    # Top: Cyan-500
    ]

    # Lightning / Scalpel cut passing from top-right to bottom-left:
    # We will slice through with an energetic glowing neon line!

    for y in range(HEIGHT):
        for x in range(WIDTH):
            idx = (y * WIDTH + x) * 4

            # 4x Supersampling for ultra-smooth rendering
            samples = [
                (x + 0.25, y + 0.25),
                (x + 0.75, y + 0.25),
                (x + 0.25, y + 0.75),
                (x + 0.75, y + 0.75),
            ]

            acc_r, acc_g, acc_b, acc_a = 0.0, 0.0, 0.0, 0.0

            for sx, sy in samples:
                dist = get_squircle_dist(sx, sy)
                if dist < 0:
                    continue

                alpha = min(1.0, max(0.0, dist + 0.5))

                # Background: Deep space / Obsidian gradient with subtle violet aura
                # Top: #0F172A (15, 23, 42) -> Bottom: #1E1B4B (30, 27, 75)
                ty = sy / HEIGHT
                tx = sx / WIDTH
                bg_r = 15 * (1 - ty) + 24 * ty
                bg_g = 23 * (1 - ty) + 24 * ty
                bg_b = 42 * (1 - ty) + 65 * ty

                # Center radial aura: glowing indigo-purple
                rad = math.sqrt((sx - 256)**2 + (sy - 250)**2) / 220.0
                if rad < 1.0:
                    aura = (1.0 - rad)**1.8 * 0.45
                    bg_r += 99 * aura
                    bg_g += 102 * aura
                    bg_b += 241 * aura

                # Outer edge subtle highlight border
                if 0.0 <= dist <= 2.5:
                    border_glow = (1.0 - abs(dist - 1.25) / 1.25) * 0.4
                    bg_r += 120 * border_glow
                    bg_g += 150 * border_glow
                    bg_b += 255 * border_glow

                # Render Slabs in order: Bottom -> Mid -> Top
                px = sx - 256.0
                color = [bg_r, bg_g, bg_b]

                for cy_slab, thick, c_top, c_left, c_right in slabs:
                    # Top face vertices:
                    v_top = [
                        (0.0, cy_slab - rh),
                        (rw, cy_slab),
                        (0.0, cy_slab + rh),
                        (-rw, cy_slab),
                    ]
                    # Left face vertices (from left to bottom):
                    v_left = [
                        (-rw, cy_slab),
                        (0.0, cy_slab + rh),
                        (0.0, cy_slab + rh + thick),
                        (-rw, cy_slab + thick),
                    ]
                    # Right face vertices (from bottom to right):
                    v_right = [
                        (0.0, cy_slab + rh),
                        (rw, cy_slab),
                        (rw, cy_slab + thick),
                        (0.0, cy_slab + rh + thick),
                    ]

                    # Check hit:
                    if point_in_poly(px, sy, v_left):
                        color = list(c_left)
                    elif point_in_poly(px, sy, v_right):
                        color = list(c_right)
                    elif point_in_poly(px, sy, v_top):
                        # Add a clean diagonal specular gradient across the top face
                        specular = (px / rw + (sy - cy_slab) / rh) * 0.5
                        specular = max(0.0, min(1.0, (specular + 1.0) * 0.5))
                        color = [
                            c_top[0] + 35 * specular,
                            c_top[1] + 35 * specular,
                            c_top[2] + 40 * specular,
                        ]

                # Now add the "Slimming Laser / Scalpel" (sharp dynamic cut across)
                # Diagonal lightning path cutting through the center:
                # Line passing through (256, 256), angle ~ -35 degrees
                # Equation: dy = -0.7 * dx
                dx = sx - 256.0
                dy = sy - 250.0
                # Distance to slash line:
                slash_dist = abs(dy + 0.75 * dx) / math.sqrt(1 + 0.75**2)
                
                # Laser beam length limit:
                proj = (dx - 0.75 * dy) / math.sqrt(1 + 0.75**2)
                if abs(proj) < 165.0:
                    if slash_dist < 4.0:
                        # Bright white-hot core
                        beam = 1.0 - (slash_dist / 4.0)
                        color = [
                            color[0] * (1 - beam) + 255 * beam,
                            color[1] * (1 - beam) + 255 * beam,
                            color[2] * (1 - beam) + 255 * beam,
                        ]
                    elif slash_dist < 18.0:
                        # Cyan / Emerald slimming neon glow
                        glow = (1.0 - (slash_dist - 4.0) / 14.0)**2 * 0.85
                        color = [
                            color[0] * (1 - glow) + 56 * glow,
                            color[1] * (1 - glow) + 189 * glow,
                            color[2] * (1 - glow) + 248 * glow,
                        ]

                # Acc
                acc_r += color[0] * alpha
                acc_g += color[1] * alpha
                acc_b += color[2] * alpha
                acc_a += alpha

            avg_a = acc_a / 4.0
            if avg_a > 0:
                img[idx] = int(min(255, max(0, acc_r / 4.0)))
                img[idx + 1] = int(min(255, max(0, acc_g / 4.0)))
                img[idx + 2] = int(min(255, max(0, acc_b / 4.0)))
                img[idx + 3] = int(min(255, max(0, avg_a * 255.0)))

    # Encode PNG
    raw_data = bytearray()
    for y in range(HEIGHT):
        raw_data.append(0)
        start = y * WIDTH * 4
        raw_data.extend(img[start:start + WIDTH * 4])

    compressed = zlib.compress(raw_data, 9)
    png = bytearray()
    png.extend(b"\x89PNG\r\n\x1a\n")

    def make_chunk(chunk_type, data):
        c = bytearray()
        c.extend(struct.pack(">I", len(data)))
        c.extend(chunk_type)
        c.extend(data)
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        c.extend(struct.pack(">I", crc))
        return c

    ihdr = struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0)
    png.extend(make_chunk(b"IHDR", ihdr))
    png.extend(make_chunk(b"IDAT", compressed))
    png.extend(make_chunk(b"IEND", b""))
    return png

if __name__ == "__main__":
    b = create_crisp_logo()
    with open("/Users/wac/WorkBuddy AI/2026-10-16-20-48-58/skill-slim/logo.png", "wb") as f:
        f.write(b)
    print("Logo updated successfully!")
