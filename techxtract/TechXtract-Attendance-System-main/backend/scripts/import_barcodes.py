import os
import sys
import glob
import re
import uuid
import argparse
from typing import Optional

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.app.db.session import SessionLocal, engine, Base
from backend.app.models import Student
from backend.app.services.barcode_decoder import decode_code128_image

DEPT_CODE_MAP = {
    'TH': 'Technical Team',
    'GP': 'Graphics Team',
    'OT': 'Operations Team',
    'PR': 'PR Team',
    'SM': 'Social Media Team',
    'AIML': 'AIML Team',
    'DSA': 'DSA Team'
}

def parse_filename_metadata(filename: str) -> dict:
    base = os.path.splitext(filename)[0]
    parts = base.split('_')
    idx = parts[0]

    # Executive Leadership check
    if 'PRESIDENT' in base or 'VICE_PRESIDENT' in base or 'GNRL_SECR' in base or 'GENERAL_SECRETARY' in base:
        if 'VICE_PRESIDENT' in base:
            role = 'Vice President'
            dept = 'Executive Board'
            name_parts = parts[parts.index('VICE')+2:]
        elif 'PRESIDENT' in base:
            role = 'President'
            dept = 'Executive Board'
            name_parts = parts[parts.index('PRESIDENT')+1:]
        elif 'GNRL_SECR' in base or 'GENERAL_SECRETARY' in base:
            role = 'General Secretary'
            dept = 'Executive Board'
            sec_idx = parts.index('GNRL') if 'GNRL' in parts else parts.index('GENERAL')
            name_parts = parts[sec_idx+2:]
        name = ' '.join(name_parts).replace('_', ' ').strip().title()
        return {'index': idx, 'dept': dept, 'role': role, 'name': name, 'num': '001'}

    # Standard format: e.g. 7_TXT_TH_017_Vihaan_Goyal or 10_TXT_TH_D_004_Lavish
    num_idx = -1
    for i, p in enumerate(parts):
        if p.isdigit() and i > 1:
            num_idx = i
            break

    if num_idx != -1:
        team_parts = parts[2:num_idx]
        team_code = team_parts[0]
        dept = DEPT_CODE_MAP.get(team_code, f"{team_code} Team")
        sub = team_parts[1] if len(team_parts) > 1 else ''
        num = parts[num_idx]
        name = ' '.join(parts[num_idx+1:]).replace('_', ' ').strip().title()
        return {'index': idx, 'dept': dept, 'subteam': sub, 'num': num, 'name': name}

    # Fallback
    return {'index': idx, 'dept': 'Technical Society', 'name': ' '.join(parts[2:]).replace('_', ' ').strip().title(), 'num': '000'}

def try_read_member_html_card(code: str, html_dir: str) -> dict:
    """
    Looks up matching HTML card to obtain canonical name and department if available.
    """
    if not os.path.exists(html_dir):
        return {}
    target_path = os.path.join(html_dir, f"{code}.html")
    if not os.path.exists(target_path):
        return {}
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            html = f.read()
        h1 = re.search(r'<h1>(.*?)</h1>', html)
        h2 = re.search(r'<h2>(.*?)</h2>', html)
        h3 = re.search(r'<h3>(.*?)</h3>', html)
        return {
            "name": h1.group(1).strip() if h1 else None,
            "dept": h2.group(1).strip() if h2 else None,
            "role": h3.group(1).strip() if h3 else None
        }
    except Exception:
        return {}

def natural_sort_key(filepath: str):
    filename = os.path.basename(filepath)
    # Natural sort splitting numbers from text: e.g. '1_...' comes before '2_...' and '10_...' comes tenth
    parts = re.split(r'(\d+)', filename)
    return [int(p) if p.isdigit() else p.lower() for p in parts]

def run_barcode_import(barcode_dir: str, html_dir: Optional[str] = None):
    print("=" * 60)
    print("TechX Attendance — Barcode Dataset Import & Migration")
    print("=" * 60)

    if not os.path.exists(barcode_dir):
        # Try fallback candidates
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
        for candidate in ["barcodes real", "barcodes", "barcodes copy", "barcode copy"]:
            cand_path = os.path.join(base_dir, candidate)
            if os.path.exists(cand_path):
                barcode_dir = cand_path
                break

    if not os.path.exists(barcode_dir):
        print(f"Error: Barcode directory does not exist: {barcode_dir}")
        return

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    gif_files = sorted(glob.glob(os.path.join(barcode_dir, "*.gif")), key=natural_sort_key)
    total_files = len(gif_files)
    print(f"Inspecting directory: {barcode_dir}")
    print(f"Total .gif barcode assets found: {total_files} (Naturally sorted 1, 2, 3... 10)")

    # Temporarily rename existing enrollment numbers to allow clean sequential reordering
    for s in db.query(Student).all():
        if not s.enrollment_no.startswith("TMP_"):
            s.enrollment_no = f"TMP_{s.enrollment_no}_{uuid.uuid4().hex[:6]}"
    db.commit()

    successfully_mapped = 0
    updated_records = 0
    duplicate_codes = 0
    unreadable = 0
    manual_review = []
    seen_encoded_values = {}

    for idx, filepath in enumerate(gif_files, start=1):
        filename = os.path.basename(filepath)
        
        # 1. Decode actual raster barcode
        decoded_value, err = decode_code128_image(filepath)
        if err or not decoded_value:
            unreadable += 1
            manual_review.append({
                "file": filename,
                "reason": f"Unreadable barcode: {err}"
            })
            continue

        # 2. Check for duplicate encoded value in this batch
        if decoded_value in seen_encoded_values:
            duplicate_codes += 1
            manual_review.append({
                "file": filename,
                "reason": f"Duplicate encoded barcode value '{decoded_value}' (first seen in {seen_encoded_values[decoded_value]})"
            })
            continue
        seen_encoded_values[decoded_value] = filename

        # 3. Parse filename metadata
        meta = parse_filename_metadata(filename)
        name = meta.get("name")
        dept = meta.get("dept", "Technical Team")

        # 4. Check if rich HTML member card exists for extra fidelity
        if html_dir:
            card_info = try_read_member_html_card(decoded_value, html_dir)
            if card_info.get("name"):
                name = card_info["name"]
            if card_info.get("dept"):
                dept = card_info["dept"]

        if not name or len(name) < 2:
            manual_review.append({
                "file": filename,
                "reason": f"Incomplete name parsed from filename: '{name}'"
            })
            continue

        # 5. Generate deterministic, collision-free college enrollment number
        # Example format: 14114800001, 14114800002, etc. in 1,2,3,4,5... order
        enrollment_no = f"141148{idx:05d}"
        
        # Generate sanitized unique email
        clean_name_parts = re.sub(r'[^a-zA-Z0-9\s]', '', name).lower().split()
        email = f"{'.'.join(clean_name_parts)}.{enrollment_no[-4:]}@techxtract.edu"

        # Check existing student in DB by decoded barcode value
        existing_student = db.query(Student).filter(
            Student.barcode_value == decoded_value
        ).first()

        if existing_student:
            existing_student.enrollment_no = enrollment_no
            existing_student.barcode_value = decoded_value
            existing_student.barcode_image_filename = filename
            existing_student.name = name
            existing_student.department = dept
            existing_student.email = email
            updated_records += 1
        else:
            qr_token = f"STU-{uuid.uuid4().hex[:12].upper()}"
            new_student = Student(
                enrollment_no=enrollment_no,
                name=name,
                email=email,
                department=dept,
                year="3rd Year",
                section="A",
                barcode_value=decoded_value,
                qr_token=qr_token,
                barcode_image_filename=filename,
                status="ACTIVE"
            )
            db.add(new_student)
            successfully_mapped += 1

    db.commit()
    db.close()

    print("\n" + "=" * 60)
    print("MIGRATION REPORT SUMMARY:")
    print("=" * 60)
    print(f"Total files:                {total_files}")
    print(f"Successfully mapped / new:  {successfully_mapped}")
    print(f"Existing updated:           {updated_records}")
    print(f"Duplicates in dataset:      {duplicate_codes}")
    print(f"Unreadable barcodes:        {unreadable}")
    print(f"Needs manual review:        {len(manual_review)}")
    print("=" * 60)

    if manual_review:
        print("\nItems Flagged for Review:")
        for item in manual_review:
            print(f" - {item['file']}: {item['reason']}")
    else:
        print("\nAll barcode assets verified and imported with zero errors!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import barcodes dataset into TechX Attendance")
    default_dir = (
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../barcodes copy"))
        if os.path.exists(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../barcodes copy")))
        else (
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../barcode copy"))
            if os.path.exists(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../barcode copy")))
            else os.path.abspath(os.path.join(os.path.dirname(__file__), "../../barcodes"))
        )
    )
    parser.add_argument("--dir", default=default_dir, help="Path to barcodes folder")
    parser.add_argument("--html-dir", default="/Users/vihaangoyal/Desktop/webdev/TechXtract-s-Smart-Icards/Members", help="Path to smart icards HTML cards")
    args = parser.parse_args()

    run_barcode_import(args.dir, args.html_dir)
