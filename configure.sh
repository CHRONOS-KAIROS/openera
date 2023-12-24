#!/bin/sh

echo Welcome to the OpenEra configuration script!
echo
echo This script will create the necessary configuration files to get a production
echo instance of OpenEra running.  Please answer the prompt below.
echo

secdir=nginx/secret
mkdir -p $secdir

echo 'Creating HTTP basic authentication...'
htpw_path=$secdir/htpasswd
if [ -f $htpw_path ]; then
  echo $htpw_path already exists, skipping.
else
  read -p 'Username: ' http_username
  htpasswd -c $htpw_path "$http_username"
  if [ $? -ne 0 ]; then
    rm $htpw_path
    exit 1
  fi
fi
echo

echo 'Creating SSL files for nginx...'
key_path=$secdir/ssl.key
crt_path=$secdir/ssl.crt
if [ -f $key_path ] && [ -f $crt_path ]; then
  echo $key_path and $crt_path already exists, skipping.
else
  echo Please note: These are self-signed certificates for development purposes only.
  echo Real certificates will need to be obtained for prduction use.
  read -p "Press Enter to continue." xyz
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout $key_path \
    -out $crt_path
  touch $secdir/key-password.txt
fi
chmod +r $key_path

dhp_path=$secdir/dhparam.pem
if [ -f $dhp_path ]; then
  echo $dhp_path already exists, skipping.
else
  openssl dhparam -dsaparam -out $dhp_path 4096
fi
echo

echo Done.
