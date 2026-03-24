import argparse
from pathlib import Path
import tempfile
import zipfile

import numpy as np
from huggingface_hub import hf_hub_download


DATASET_REPO_ID = "Matthijs/cmu-arctic-xvectors"
ARCHIVE_FILENAME = "spkrec-xvect.zip"
DEFAULT_ARCHIVE_MEMBER = "spkrec-xvect/cmu_us_slt_arctic-wav-arctic_b0258.npy"
DEFAULT_OUTPUT_PATH = Path("speaker_embeddings/default.npy")


def download_archive(cache_dir=None):
    return hf_hub_download(
        repo_id=DATASET_REPO_ID,
        filename=ARCHIVE_FILENAME,
        repo_type="dataset",
        cache_dir=cache_dir,
    )


def extract_embedding(archive_path, member_name):
    with zipfile.ZipFile(archive_path) as archive:
        with archive.open(member_name) as embedding_file:
            embedding = np.load(embedding_file)

    if embedding.shape != (512,):
        raise ValueError(
            f"Expected extracted embedding to have shape (512,), got {embedding.shape}"
        )

    return embedding


def main():
    parser = argparse.ArgumentParser(
        description="Download one CMU Arctic xvector embedding and save it locally."
    )
    parser.add_argument(
        "--member",
        default=DEFAULT_ARCHIVE_MEMBER,
        help=(
            "Path of the .npy file inside spkrec-xvect.zip. "
            f"Default: {DEFAULT_ARCHIVE_MEMBER}"
        ),
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help=f"Where to save the extracted .npy file. Default: {DEFAULT_OUTPUT_PATH}",
    )
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as cache_dir:
        archive_path = download_archive(cache_dir=cache_dir)
        embedding = extract_embedding(archive_path, args.member)

    np.save(output_path, embedding)
    print(f"Saved speaker embedding to {output_path}")


if __name__ == "__main__":
    main()
