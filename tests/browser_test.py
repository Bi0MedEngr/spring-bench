# UI test: each spring type, slider and chart hover, math drawer, US units, light/dark/iPad/phone, a download.
# Run: ~/.venvs/mcmaster_torx/bin/python tests/browser_test.py <out_dir>
import os, sys
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__)); out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/spring_shots'
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(here, '..', 'docs', 'index.html')
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    def page(w, h, scheme, touch=False):
        ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=2, has_touch=touch, accept_downloads=True)
        pg = ctx.new_page()
        pg.on('console', lambda m: m.type in ('error', 'warning') and errs.append(f'{scheme} {w}: {m.text}'))
        pg.on('pageerror', lambda e: errs.append(f'{scheme} {w}: pageerror {e}'))
        pg.goto(url); pg.wait_for_timeout(600)
        return pg
    pg = page(1440, 900, 'light')
    print('start |', pg.inner_text('#status'))
    pg.screenshot(path=f'{out}/compression.png')
    for k in ['valve', 'tallSlender', 'door', 'clothespin']:
        pg.select_option('#presetSel', k); pg.wait_for_timeout(250)
        print(k, '|', pg.inner_text('#status'), '|', pg.inner_text('#stateOut'))
        pg.screenshot(path=f'{out}/p_{k}.png')
    # slider
    pg.select_option('#presetSel', 'valve'); pg.fill('#state', '950'); pg.dispatch_event('#state', 'input'); pg.wait_for_timeout(100)
    print('slider 95% |', pg.inner_text('#stateOut')); pg.screenshot(path=f'{out}/valve_compressed.png')
    # edit a field: wire diameter
    pg.fill('[data-key=d]', '4.8'); pg.press('[data-key=d]', 'Enter'); pg.wait_for_timeout(200)
    print('d 4.8 |', pg.inner_text('#status'))
    pg.fill('[data-key=_rate]', '25'); pg.click('text=Set coils for this rate'); pg.wait_for_timeout(200)
    print('rate 25 |', pg.inner_text('#status'), pg.evaluate('window.__springBench.model.Na'))
    pg.click('text=Free length for 15% overrun'); pg.wait_for_timeout(200)
    print('fixed L0 |', pg.inner_text('#status'), pg.evaluate('window.__springBench.model.L0'))
    pg.click('#mathBtn'); pg.wait_for_timeout(400); pg.screenshot(path=f'{out}/math.png')
    print('math |', pg.eval_on_selector_all('#mathBody summary', 'ss => ss.map(s => s.textContent).join(", ")'))
    pg.keyboard.press('Escape')
    pg.click('#inputs .seg >> nth=1 >> text=in, lbf'); pg.wait_for_timeout(200)
    print('US |', pg.inner_text('#status')); pg.screenshot(path=f'{out}/us.png')
    # McMaster import from a pasted page (fixture in the copied-page layout)
    page_txt = 'Compression Spring\n1" Long, 0.48" OD, 0.37" ID\n9657K311\n' + '\n'.join(['Material', 'Spring Steel', 'Length', '1"', 'OD', '0.48"', 'ID', '0.37"', 'Wire Diameter', '0.055"', 'Compressed Length @ Maximum Load', '0.56"', 'Maximum Load', '15 lb.', 'Spring Rate', '35 lbf/in', 'End Type', 'Closed and Ground', 'Spring Type', 'Compression', 'Steel Grade', 'Music-Wire Steel', 'System of Measurement', 'Inch'])
    pg.fill('[data-key=_pn]', '9657K311'); pg.click('text=Import…'); pg.fill('#mmPaste', page_txt); pg.dispatch_event('#mmPaste', 'input'); pg.wait_for_timeout(150)
    print('mcmaster |', pg.inner_text('.verdict')); pg.click('#mmUse'); pg.wait_for_timeout(200); print('imported |', pg.inner_text('#status'), '| F2 field', pg.input_value('[data-key=F2]'))
    pg.screenshot(path=f'{out}/mcmaster.png')
    with pg.expect_download() as d:
        pg.click('#fileBtn'); pg.click('[data-act=csv]')
    print('download:', d.value.suggested_filename)
    pg.keyboard.press('Meta+z'); pg.wait_for_timeout(150); print('undo |', pg.inner_text('#status'))
    pgd = page(1440, 900, 'dark'); pgd.select_option('#presetSel', 'door'); pgd.wait_for_timeout(200); pgd.screenshot(path=f'{out}/dark_door.png')
    pgi = page(1180, 820, 'light', True); pgi.screenshot(path=f'{out}/ipad.png', full_page=True)
    print('ipad scrollWidth', pgi.evaluate('document.documentElement.scrollWidth'))
    pgm = page(390, 844, 'light', True); pgm.screenshot(path=f'{out}/phone.png', full_page=True)
    print('phone scrollWidth', pgm.evaluate('document.documentElement.scrollWidth'))
    b.close()
print('\n'.join(errs) or 'no console errors')
