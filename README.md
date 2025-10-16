1. AWS_PROFILE
If you use named profiles in ~/.aws/credentials, set:

This tells the SDK to use a specific profile.

2. AWS_SDK_LOAD_CONFIG
Set this to 1 to make the SDK load the full config (including profiles and region) from ~/.aws/config:

This is often required for the SDK to respect your CLI config.

3. AWS_DEFAULT_REGION
Set this if your region is not set elsewhere: