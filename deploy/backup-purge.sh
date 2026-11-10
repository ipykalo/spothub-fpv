#!/bin/sh
# Sourced by backup-offsite.sh, inside the MinIO image: a shell and `mc`, no
# awk and no grep, so the matching is done with shell patterns.
#
#   purge_departed <mc path of the media mirror> <file of live account ids>
#
# Removes each top-level folder of the mirror whose name is an account id that
# is no longer in the file. Folders that are not an id are left alone, and an
# empty or missing file removes nothing: no list of accounts is never taken to
# mean that every account is gone.

purge_departed() {
  mirror="$1"
  accounts="$2"

  if [ ! -s "$accounts" ]; then
    echo "storage: no list of accounts, nothing purged"
    return 0
  fi

  live=$(cat "$accounts")
  purged=0

  # `mc ls` prints "[date] size name/" — the folder name is the last field.
  for folder in $(mc ls "$mirror/" | while read -r line; do echo "${line##* }"; done); do
    id="${folder%/}"

    case "$id" in
      ????????-????-????-????-????????????) ;;
      *) continue ;;
    esac

    case "$live" in
      *"$id"*) ;;
      *)
        mc rm -q --recursive --force "$mirror/$id/" > /dev/null
        purged=$((purged + 1))
        ;;
    esac
  done

  echo "storage: purged the files of $purged deleted account(s)"
}
