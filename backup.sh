backup_path='/Users/azlisme/Library/Mobile Documents/com~apple~CloudDocs/Blog'
backup_name="Blog Backup - $(date)"

tar -cf backup.tar --exclude node_modules --exclude public --exclude .deploy_git * .git
mv backup.tar "$backup_path/$backup_name.tar"