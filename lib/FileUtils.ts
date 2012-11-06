///<reference path='directoryInfo.ts'/>
///<reference path='manifest.ts'/>

function kuduSync(fromPath: string, toPath: string, nextManifestPath: string, previousManifestPath: string, whatIf: bool) {
    Ensure.argNotNull(fromPath, "fromPath");
    Ensure.argNotNull(toPath, "toPath");
    Ensure.argNotNull(nextManifestPath, "nextManifestPath");

    var from = new DirectoryInfo(fromPath);
    var to = new DirectoryInfo(toPath);

    var nextManifest = new Manifest();

    log("Kudu sync from: " + from.path() + " to: " + to.path());

    kuduSyncDirectory(from, to, from.path(), to.path(), Manifest.load(previousManifestPath), nextManifest, whatIf);

    if (!whatIf) {
        Manifest.save(nextManifest, nextManifestPath);
    }
}

exports.kuduSync = kuduSync;

function copyFile(fromFile: FileInfo, toFilePath: string, whatIf: bool) {
    Ensure.argNotNull(fromFile, "fromFile");
    Ensure.argNotNull(toFilePath, "toFilePath");

    log("Copy file from: " + fromFile.path() + " to: " + toFilePath);

    if (!whatIf) {
        fs.createReadStream(fromFile.path()).pipe(fs.createWriteStream(toFilePath));
    }
}

function deleteFile(file: FileInfo, whatIf: bool) {
    Ensure.argNotNull(file, "file");

    var path = file.path();

    log("Deleting file: " + path);

    if (!whatIf) {
        fs.unlinkSync(path);
    }
}

function deleteDirectoryRecursive(directory: DirectoryInfo, whatIf: bool) {
    Ensure.argNotNull(directory, "directory");

    var path = directory.path();
    log("Deleting directory: " + path);

    var files = directory.files();
    for (var fileKey in files) {
        var file = files[fileKey];
        deleteFile(file, whatIf);
    }

    var subDirectories = directory.subDirectories();
    for (var subDirectoryKey in subDirectories) {
        var subDirectory = subDirectories[subDirectoryKey];
        deleteDirectoryRecursive(subDirectory, whatIf);
    }

    if (!whatIf) {
        fs.rmdirSync(path);
    }
}

function kuduSyncDirectory(from: DirectoryInfo, to: DirectoryInfo, fromRootPath: string, toRootPath: string, manifest: Manifest, outManifest: Manifest, whatIf: bool) {
    Ensure.argNotNull(from, "from");
    Ensure.argNotNull(to, "to");
    Ensure.argNotNull(fromRootPath, "fromRootPath");
    Ensure.argNotNull(toRootPath, "toRootPath");
    Ensure.argNotNull(manifest, "manifest");
    Ensure.argNotNull(outManifest, "outManifest");

    // TODO: Generalize files to ignore
    if (from.isSourceControl()) {
        // No need to copy the source control directory (.git).
        return;
    }

    if (!whatIf) {
        to.ensureCreated();
    }

    var fromFiles = from.files();
    var toFiles = getFilesConsiderWhatIf(to, whatIf);

    // If the file doesn't exist in the source, only delete if:
    // 1. We have no previous directory
    // 2. We have a previous directory and the file exists there
    for (var toFileKey in toFiles) {
        var toFile: FileInfo = toFiles[toFileKey];

        // TODO: handle case sensitivity
        if (!fromFiles[toFile.name()]) {
            if (manifest.isEmpty() || manifest.isPathInManifest(toFile.path(), toRootPath)) {
                deleteFile(toFile, whatIf);
            }
        }
    }

    // Copy files
    for (var fromFileKey in fromFiles) {
        var fromFile: FileInfo = fromFiles[fromFileKey];
        outManifest.addFileToManifest(fromFile.path(), fromRootPath);

        // Skip deployment files

        // if the file exists in the destination then only copy it again if it's
        // last write time is different than the same file in the source (only if it changed)
        var toFile = toFiles[fromFile.name()];

        if (toFile == null || fromFile.modifiedTime() > toFile.modifiedTime()) {
            copyFile(fromFile, pathUtil.join(to.path(), fromFile.name()), whatIf);
        }
    }

    var fromSubDirectories = from.subDirectories();
    var toSubDirectories = getSubDirectoriesConsiderWhatIf(to, whatIf);

    // If the file doesn't exist in the source, only delete if:
    // 1. We have no previous directory
    // 2. We have a previous directory and the file exists there
    for (var toSubDirectoryKey in toSubDirectories) {
        var toSubDirectory: DirectoryInfo = toSubDirectories[toSubDirectoryKey];

        if (!fromSubDirectories[toSubDirectory.name()]) {
            if (manifest.isEmpty() || manifest.isPathInManifest(toSubDirectory.path(), toRootPath)) {
                deleteDirectoryRecursive(toSubDirectory, whatIf);
            }
        }
    }

    // Copy directories
    for (var fromSubDirectoryKey in fromSubDirectories) {
        var fromSubDirectory: DirectoryInfo = fromSubDirectories[fromSubDirectoryKey];
        outManifest.addFileToManifest(fromSubDirectory.path(), fromRootPath);

        var toSubDirectory = new DirectoryInfo(pathUtil.join(to.path(), fromSubDirectory.name()));
        kuduSyncDirectory(
            fromSubDirectory,
            toSubDirectory,
            fromRootPath,
            toRootPath,
            manifest,
            outManifest,
            whatIf);
    }
}

function getFilesConsiderWhatIf(dir: DirectoryInfo, whatIf: bool): FileInfo[] {
    try {
        return dir.files();
    }
    catch (e) {
        if (whatIf) {
            return [];
        }

        throw e;
    }
}

function getSubDirectoriesConsiderWhatIf(dir: DirectoryInfo, whatIf: bool): DirectoryInfo[] {
    try {
        return dir.subDirectories();
    }
    catch (e) {
        if (whatIf) {
            return [];
        }

        throw e;
    }
}
