#!/usr/bin/env python3
"""Combine all extracted files into one MD and TXT file, then cleanup"""

import os
from pathlib import Path
import shutil

BASE_DIR = Path("/home/cosmas/Documents/Visual Code/mihasv3")
EXTRACTED_DIR = BASE_DIR / "EXTRACTED_SOURCE"
OUTPUT_MD = BASE_DIR / "COMPLETE_SOURCE_CODE_FINAL.md"
OUTPUT_TXT = BASE_DIR / "COMPLETE_SOURCE_CODE_FINAL.txt"

# Files to combine (in order)
FILES_TO_COMBINE = [
    "README.md",
    "INDEX.md",
    "DATABASE_COMPLETE.md",
    "LIB.md",
    "HOOKS_GENERAL.md",
    "HOOKS_ADMIN.md",
    "HOOKS_AUTH.md",
    "COMPONENTS_APPLICATION.md",
    "COMPONENTS_ADMIN.md",
    "COMPONENTS_UI.md",
    "COMPONENTS_STUDENT.md",
    "COMPONENTS_OTHER.md",
    "PAGES_STUDENT.md",
    "PAGES_ADMIN.md",
    "PAGES_AUTH.md",
    "PAGES_OTHER.md",
    "API_FUNCTIONS.md",
    "SERVICES.md",
    "UTILS.md",
    "DATA.md",
    "TYPES.md",
    "FORMS.md",
    "CONFIG.md",
    "ROUTES.md",
    "CONTEXTS.md",
    "STORES.md",
    "STYLES.md",
    "ROOT.md"
]

def combine_files():
    """Combine all files into one MD and TXT"""
    
    print("=" * 60)
    print("COMBINING ALL EXTRACTED FILES")
    print("=" * 60)
    print()
    
    total_size = 0
    files_combined = 0
    
    # Create MD file
    with open(OUTPUT_MD, 'w', encoding='utf-8') as md_out:
        md_out.write("# MIHAS V3 - COMPLETE SOURCE CODE\n")
        md_out.write("# ALL FILES COMBINED\n\n")
        md_out.write(f"Total files: {len(FILES_TO_COMBINE)}\n")
        md_out.write(f"Generated: 2025-01-23\n\n")
        md_out.write("=" * 80 + "\n\n")
        
        for filename in FILES_TO_COMBINE:
            filepath = EXTRACTED_DIR / filename
            
            if filepath.exists():
                print(f"✓ Appending {filename}...")
                
                md_out.write(f"\n\n{'=' * 80}\n")
                md_out.write(f"# SOURCE FILE: {filename}\n")
                md_out.write(f"{'=' * 80}\n\n")
                
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    md_out.write(content)
                    total_size += len(content)
                
                files_combined += 1
            else:
                print(f"✗ Warning: {filename} not found")
    
    # Create TXT file (same content)
    shutil.copy(OUTPUT_MD, OUTPUT_TXT)
    
    print()
    print(f"✓ Combined {files_combined} files")
    print(f"✓ Total size: {total_size / 1024 / 1024:.2f} MB")
    print(f"✓ Created: {OUTPUT_MD.name}")
    print(f"✓ Created: {OUTPUT_TXT.name}")
    
    return files_combined, total_size

def verify_combined_file():
    """Verify the combined file contains all content"""
    
    print()
    print("=" * 60)
    print("VERIFYING COMBINED FILE")
    print("=" * 60)
    print()
    
    if not OUTPUT_MD.exists():
        print("✗ ERROR: Combined file not created!")
        return False
    
    # Check file size
    md_size = OUTPUT_MD.stat().st_size
    txt_size = OUTPUT_TXT.stat().st_size
    
    print(f"✓ MD file size: {md_size / 1024 / 1024:.2f} MB")
    print(f"✓ TXT file size: {txt_size / 1024 / 1024:.2f} MB")
    
    # Verify all files are mentioned
    with open(OUTPUT_MD, 'r', encoding='utf-8') as f:
        content = f.read()
    
    missing = []
    for filename in FILES_TO_COMBINE:
        if f"SOURCE FILE: {filename}" not in content:
            missing.append(filename)
    
    if missing:
        print(f"✗ WARNING: Missing files in combined output: {missing}")
        return False
    
    print(f"✓ All {len(FILES_TO_COMBINE)} files verified in combined output")
    return True

def cleanup_old_files():
    """Delete old extraction files and folders"""
    
    print()
    print("=" * 60)
    print("CLEANING UP OLD FILES")
    print("=" * 60)
    print()
    
    # Files to delete
    files_to_delete = [
        "COMPLETE_SOURCE_CODE.md",
        "COMPLETE_SOURCE_INDEX.md",
        "EXTRACTION_SUMMARY.md",
        "COMPLETE_SOURCE_PHASE1_DATABASE.md",
        "PROJECT_SNAPSHOT.txt",
        "extract_complete_source.sh",
        "extract_all_code.py",
        "extract_database.py",
        "extract_api.py",
        "combine_and_cleanup.py",
        "START_HERE.md",
        "QUICK_REFERENCE.md",
        "EXTRACTION_COMPLETE.md",
        "READ_ME_FIRST.md"
    ]
    
    # Folders to delete
    folders_to_delete = [
        "EXTRACTED_SOURCE",
        "COMPLETE_SOURCE_CODE"
    ]
    
    deleted_files = 0
    deleted_folders = 0
    
    # Delete files
    for filename in files_to_delete:
        filepath = BASE_DIR / filename
        if filepath.exists():
            filepath.unlink()
            print(f"✓ Deleted: {filename}")
            deleted_files += 1
    
    # Delete folders
    for foldername in folders_to_delete:
        folderpath = BASE_DIR / foldername
        if folderpath.exists():
            shutil.rmtree(folderpath)
            print(f"✓ Deleted folder: {foldername}")
            deleted_folders += 1
    
    print()
    print(f"✓ Deleted {deleted_files} files")
    print(f"✓ Deleted {deleted_folders} folders")

def main():
    """Main execution"""
    
    # Step 1: Combine files
    files_combined, total_size = combine_files()
    
    # Step 2: Verify
    if not verify_combined_file():
        print("\n✗ VERIFICATION FAILED - NOT CLEANING UP")
        return
    
    # Step 3: Cleanup
    cleanup_old_files()
    
    # Final summary
    print()
    print("=" * 60)
    print("COMPLETE!")
    print("=" * 60)
    print()
    print(f"✓ Combined {files_combined} files")
    print(f"✓ Total size: {total_size / 1024 / 1024:.2f} MB")
    print(f"✓ Output files:")
    print(f"  - {OUTPUT_MD}")
    print(f"  - {OUTPUT_TXT}")
    print()
    print("✓ All old files and folders cleaned up")
    print()
    print("🎉 YOUR COMPLETE SOURCE CODE IS READY!")
    print()

if __name__ == "__main__":
    main()