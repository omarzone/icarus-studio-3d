from fastapi import APIRouter, Request

from icarus.contracts.storage import ChangeDataFolder, DataFolderCheck, DataFolderChoice, DataFolderMove, StorageInfo
from icarus.storage.data_folder_move import DataFolderMover

router = APIRouter(prefix="/settings/storage")


def _mover(request: Request) -> DataFolderMover:
    return request.app.state.data_folder


@router.get("")
def get_storage(request: Request) -> StorageInfo:
    return _mover(request).info()


@router.post("/check")
def check_data_folder(request: Request, body: DataFolderChoice) -> DataFolderCheck:
    return _mover(request).check(body.folder)


@router.post("/move", status_code=202)
def change_data_folder(request: Request, body: ChangeDataFolder) -> DataFolderMove:
    return _mover(request).start(body)


@router.get("/move")
def data_folder_move(request: Request) -> DataFolderMove:
    return _mover(request).status()
