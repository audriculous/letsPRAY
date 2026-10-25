# Puts the app icon and launch screen into the iPhone project.
# Run after `node scripts/icon-png.cjs .` (needs Pillow: pip install pillow).
from PIL import Image

ASSETS = 'ios/App/App/Assets.xcassets'
BG = (0xEF, 0xED, 0xE8)  # the app background, which the icon also uses

# The App Store refuses icons with an alpha channel.
icon = Image.open('icons/app-store-1024.png').convert('RGB')
icon.save('icons/app-store-1024.png')
icon.save(f'{ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png')

# Launch screen: the wordmark, small and centred, on the app background.
# iOS crops this square image to the screen, so the middle is what shows.
splash = Image.new('RGB', (2732, 2732), BG)
mark = icon.resize((620, 620), Image.LANCZOS)
splash.paste(mark, ((2732 - 620) // 2, (2732 - 620) // 2))
for name in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
    splash.save(f'{ASSETS}/Splash.imageset/{name}')
print('iOS icon and launch screen updated')
