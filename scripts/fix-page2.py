with open('/home/z/my-project/src/app/page.tsx', 'r') as f:
    lines = f.readlines()

# Remove duplicate import line (line 36)
new_lines = []
prev_line = ''
for line in lines:
    if line.strip() == prev_line.strip() and 'JournalView' in line:
        continue  # skip duplicate
    prev_line = line
    new_lines.append(line)

with open('/home/z/my-project/src/app/page.tsx', 'w') as f:
    f.writelines(new_lines)

print('OK: duplicates removed')
