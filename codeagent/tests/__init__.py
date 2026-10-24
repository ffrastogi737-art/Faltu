import os
import tempfile

# Sessions, memory and the database go to a throwaway folder, never ~/.edith.
os.environ["EDITH_HOME"] = tempfile.mkdtemp(prefix="edith-test-")
