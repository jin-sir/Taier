/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState } from 'react';
import type { IMenuItemProps, ITreeNodeItemProps } from '@dtinsight/molecule/esm/components';
import { ActionBar } from '@dtinsight/molecule/esm/components';
import { Content, Header } from '@dtinsight/molecule/esm/workbench/sidebar';
import { connect } from '@dtinsight/molecule/esm/react';
import functionManagerService from '../../services/functionManagerService';
import type { IFolderTree, IFolderTreeNodeProps } from '@dtinsight/molecule/esm/model';
import { FolderTree } from '@dtinsight/molecule/esm/workbench/sidebar/explore';
import FnViewModal from './fnViewModal';
import { FUNCTION_EDIT, FUNCTION_NEW_FOLDER, FUNCTION_NEW_FUNCTION, FUNCTION_REMOVE } from './menu';
import { Modal } from 'antd';
import ajax from '../../api';
import FnModal from './fnModal';
import FolderModal from './folderModal';
import { CATELOGUE_TYPE, MENU_TYPE_ENUM, TASK_TYPE_ENUM } from '@/constant';
import { loadTreeNode } from '@/utils/extensions';
import { TreeViewUtil } from '@dtinsight/molecule/esm/common/treeUtil';
import { UniqueId } from '@dtinsight/molecule/esm/common/types';
import './index.scss';

const { confirm } = Modal;
const FolderTreeView = connect(functionManagerService, FolderTree);

interface IFunctionViewProps {
	panel: any;
	headerToolBar: any[];
}

/**
 * 获取当前文件夹所属的类型，从当前文件出发，逐步往上找，直到找到 SparkSQL 文件夹或者 FlinkSQL 文件夹
 */
function getBaseType(id: UniqueId): typeof TYPE_ITERATOR[number] | null {
	const root = functionManagerService.getState().folderTree?.data?.[0];
	const TYPE_ITERATOR = [MENU_TYPE_ENUM.SPARKFUNC, MENU_TYPE_ENUM.FLINKFUNC] as const;
	if (root) {
		const treeHelper = new TreeViewUtil(root);
		let node = treeHelper.getHashMap(id);
		while (node) {
			const isTargetFile = TYPE_ITERATOR.includes(node.node.data.catalogueType);
			if (isTargetFile) {
				return node.node.data.catalogueType;
			} else {
				if (node.parent) {
					node = treeHelper.getHashMap(node.parent);
				} else {
					node = null;
				}
			}
		}
	}

	return null;
}

const FunctionManagerView = ({ headerToolBar, panel, entry }: IFunctionViewProps & IFolderTree) => {
	const [viewVisible, setViewVisible] = useState(false);
	const [isModalShow, setModalShow] = useState(false);
	const [folderVisible, setFolderVisible] = useState(false);
	const [currentMenuData, setMenuData] = useState<any>(undefined);
	const [editData, setEditData] = useState<any>(undefined);
	const [resId, setResId] = React.useState<number | null>(null);
	const [expandKeys, setExpandKeys] = useState<string[]>([]);

	const updateNodePid = async (node: ITreeNodeItemProps) => {
		loadTreeNode(node.data, CATELOGUE_TYPE.FUNCTION);
	};

	const loadData = async (treeNode: IFolderTreeNodeProps) => {
		updateNodePid(treeNode);
	};

	const handleSelect = (file?: ITreeNodeItemProps) => {
		functionManagerService.setActive(file?.id);
		if (file) {
			if (file.isLeaf) {
				setViewVisible(true);
				setResId(file.data.id);
			}
		}
	};

	const handleCloseViewModal = () => {
		setViewVisible(false);
		setResId(null);
	};

	const handleContextMenu = (contextMenu: IMenuItemProps, treeNode?: ITreeNodeItemProps) => {
		const menuId = contextMenu.id;
		switch (menuId) {
			case FUNCTION_NEW_FUNCTION.id: {
				// 获取右键文件夹属于所属文件夹
				const belongTo = getBaseType(treeNode!.id);
				const CATELOGUE_TO_TYPE = {
					[MENU_TYPE_ENUM.SPARKFUNC]: TASK_TYPE_ENUM.SPARK_SQL,
					[MENU_TYPE_ENUM.FLINKFUNC]: TASK_TYPE_ENUM.SQL,
				};
				setMenuData({
					nodePid: treeNode!.data.id,
					taskType: belongTo ? CATELOGUE_TO_TYPE[belongTo] : undefined,
				});
				setModalShow(true);
				break;
			}
			case FUNCTION_NEW_FOLDER.id: {
				setFolderVisible(true);
				setEditData({ parentId: treeNode!.data.id });
				break;
			}
			case FUNCTION_EDIT.id: {
				if (treeNode!.data.type === 'file') {
					ajax.getOfflineFn({
						functionId: treeNode!.data.id,
					}).then((res) => {
						if (res.code === 1) {
							setMenuData({
								...res.data,
								taskType: res.data.type,
								nodePid: treeNode!.data.parentId,
							});
							setModalShow(true);
						}
					});
				} else {
					setFolderVisible(true);
					setEditData(treeNode!.data);
				}
				break;
			}
			case FUNCTION_REMOVE.id: {
				const isFolder = !treeNode?.isLeaf;
				confirm({
					title: isFolder ? '确认要删除此文件夹吗?' : '确认要删除此函数吗',
					content: isFolder ? '删除的文件夹无法恢复!' : '删除的函数无法找回！',
					onOk() {
						const fun = isFolder
							? ajax.delOfflineFn({
									functionId: treeNode!.data.id,
							  })
							: ajax.delOfflineFolder({
									id: treeNode!.data.id,
							  });
						fun.then((res) => {
							if (res.code) {
								const parentNode = functionManagerService.get(
									`${treeNode!.data.parentId}-folder`,
								);
								if (parentNode) {
									updateNodePid(parentNode);
								}
							}
						});
					},
					onCancel() {},
				});
				break;
			}
			default:
				break;
		}
	};

	const handleHeaderContextClick = (
		e: React.MouseEvent<Element, MouseEvent>,
		item?: IMenuItemProps,
	) => {
		e.preventDefault();
		switch (item?.id) {
			case FUNCTION_NEW_FUNCTION.id: {
				setModalShow(true);
				break;
			}
			default:
				break;
		}
	};

	const handleToggleCreatFn = () => {
		setMenuData(undefined);
		setModalShow(false);
	};

	const handleCloseFolderModal = () => {
		setFolderVisible(false);
		setEditData(false);
	};

	const handleExpandKeys = (keys: string[]) => {
		setExpandKeys(keys);
	};

	const handleRightClick = (treeNode: ITreeNodeItemProps) => {
		// 区分是系统函数的文件还是自定义函数的文件
		if (treeNode.data.type === 'file') {
			const { parentId } = treeNode.data;
			const parentNode = functionManagerService.get(`${parentId}-folder`);
			if (parentNode?.data.catalogueType === MENU_TYPE_ENUM.SYSFUC) {
				// 系统函数文件没有右键菜单
				return [];
			}

			return [FUNCTION_EDIT, FUNCTION_REMOVE];
		}

		if (treeNode.data.type === 'folder') {
			// 判断当前文件夹是否属于系统函数或者 SparkSQL 根目录
			const SHOULD_NOT_HAVE_CONTEXT_MENU = [
				MENU_TYPE_ENUM.SYSFUC,
				MENU_TYPE_ENUM.SPARKFUNC,
				MENU_TYPE_ENUM.FLINKFUNC,
			];
			if (SHOULD_NOT_HAVE_CONTEXT_MENU.includes(treeNode.data.catalogueType)) {
				return [];
			}

			const baseContextMenu = [FUNCTION_NEW_FUNCTION, FUNCTION_NEW_FOLDER];
			// root folder can't edit and remove
			if (treeNode.data.level === 1) {
				return baseContextMenu;
			}

			return baseContextMenu.concat([FUNCTION_EDIT, FUNCTION_REMOVE]);
		}
	};

	// 添加文件夹
	const handleAddCatalogue = (params: any) => {
		return ajax.addOfflineCatalogue(params).then((res) => {
			if (res.code === 1) {
				const parentNode = functionManagerService.get(`${params.nodePid}-folder`);
				if (parentNode) {
					updateNodePid(parentNode);
				}
				return true;
			}
			return false;
		});
	};

	const handleAddFunction = (params: any) => {
		return ajax
			.addOfflineFunction({
				...params,
				catalogueType: MENU_TYPE_ENUM.SYSFUC,
			})
			.then((res) => {
				if (res.code === 1) {
					const parentNode = functionManagerService.get(`${params.nodePid}-folder`);
					if (parentNode) {
						updateNodePid(parentNode);
					}
					return true;
				}

				return false;
			});
	};

	const handleEditCatalogue = (params: any) => {
		return ajax
			.editOfflineCatalogue({ ...params, type: 'folder' }) // 文件夹编辑，新增参数固定为folder
			.then((res) => {
				if (res.code === 1) {
					const currentNode = functionManagerService.get(`${params.id}-${params.type}`);
					const parentNode = functionManagerService.get(
						`${params.nodePid}-${params.type}`,
					);
					// the saving position has been changed
					if (currentNode?.data.parentId !== params.nodePid) {
						const nextParentNode = functionManagerService.get(
							`${currentNode?.data.parentId}-folder`,
						);
						updateNodePid(nextParentNode!);
					}
					if (parentNode) {
						updateNodePid(parentNode);
					}
					return true;
				}
				return false;
			});
	};

	const handleEditFunction = (params: any) => {
		return ajax.addOfflineFunction(params).then((res) => {
			if (res.code === 1) {
				const currentNode = functionManagerService.get(`${params.id}-file`);
				// the saving position has been changed
				if (currentNode?.data.parentId !== params.nodePid) {
					const parentNode = functionManagerService.get(
						`${currentNode?.data.parentId}-folder`,
					);
					updateNodePid(parentNode!);
				}

				// update the parent node
				const parentNode = functionManagerService.get(`${params.nodePid}-folder`);
				if (parentNode) {
					updateNodePid(parentNode);
				}
				return true;
			}
			return false;
		});
	};

	return (
		<div className="functionManager-container">
			<Header
				title="函数管理"
				toolbar={
					<ActionBar data={headerToolBar} onContextMenuClick={handleHeaderContextClick} />
				}
			/>
			<Content>
				<div tabIndex={0} className="functionManager-content">
					<FolderTreeView
						expandKeys={expandKeys}
						onExpandKeys={handleExpandKeys}
						onRightClick={handleRightClick}
						draggable={false}
						onSelectFile={handleSelect}
						onLoadData={loadData}
						onClickContextMenu={handleContextMenu}
						panel={panel}
						entry={entry}
					/>
				</div>
			</Content>
			<FnViewModal visible={viewVisible} fnId={resId} closeModal={handleCloseViewModal} />
			<FnModal
				visible={isModalShow}
				onClose={handleToggleCreatFn}
				onAddFunction={handleAddFunction}
				onEditFunction={handleEditFunction}
				data={currentMenuData}
			/>
			<FolderModal
				isModalShow={folderVisible}
				dataType={CATELOGUE_TYPE.FUNCTION}
				toggleCreateFolder={handleCloseFolderModal}
				treeData={currentMenuData}
				defaultData={editData}
				addOfflineCatalogue={handleAddCatalogue}
				editOfflineCatalogue={handleEditCatalogue}
			/>
		</div>
	);
};

export default connect(functionManagerService, FunctionManagerView);
