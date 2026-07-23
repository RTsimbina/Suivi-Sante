with open('/home/z/my-project/src/app/page.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    # Skip line 64 (index 63) which is the duplicate journal nav item
    if i == 63:
        continue
    new_lines.append(line)

with open('/home/z/my-project/src/app/page.tsx', 'w') as f:
    f.writelines(new_lines)

print('OK: line 64 duplicate removed')