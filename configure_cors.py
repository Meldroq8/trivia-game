#!/usr/bin/env python3
"""
Configure Firebase Storage CORS settings using Python
"""

import json
import subprocess
import sys

def install_gcloud_storage():
    """Install google-cloud-storage if not available"""
    try:
        import google.cloud.storage
        print("google-cloud-storage is already installed")
        return True
    except ImportError:
        print("Installing google-cloud-storage...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "google-cloud-storage"])
            print("google-cloud-storage installed successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"Failed to install google-cloud-storage: {e}")
            return False

def configure_cors():
    """Configure CORS for Firebase Storage bucket"""

    if not install_gcloud_storage():
        return False

    try:
        from google.cloud import storage

        # CORS configuration
        cors_config = [
            {
                "origin": [
                    "http://localhost:5174",
                    "http://localhost:5173",
                    "http://localhost:3000",
                    "http://localhost:8080",
                    "https://lamah-357f3.web.app",
                    "https://lamah-357f3.firebaseapp.com"
                ],
                "method": ["GET", "HEAD"],
                "maxAgeSeconds": 3600,
                "responseHeader": ["Content-Type"]
            }
        ]

        # Initialize client
        client = storage.Client()
        bucket_name = "lamah-357f3.appspot.com"
        bucket = client.bucket(bucket_name)

        # Set CORS configuration
        bucket.cors = cors_config
        bucket.patch()

        print("CORS configuration applied successfully!")
        print("CORS settings:")
        for rule in cors_config:
            print(f"   Origins: {rule['origin']}")
            print(f"   Methods: {rule['method']}")
            print(f"   Max Age: {rule['maxAgeSeconds']} seconds")

        return True

    except Exception as e:
        print(f"Failed to configure CORS: {e}")
        print("\nAlternative solutions:")
        print("1. Install Google Cloud SDK and use gsutil")
        print("2. Use Firebase Console (web interface)")
        print("3. Use the Service Worker approach we implemented")
        return False

if __name__ == "__main__":
    print("Configuring Firebase Storage CORS...")
    success = configure_cors()

    if success:
        print("\nCORS configuration complete!")
        print("Now refresh your app and images should cache to localStorage!")
    else:
        print("\nCORS configuration failed.")
        print("Please try the manual gsutil approach or Service Worker solution.")