import { Meteor } from 'meteor/meteor';
import type { IUser } from '@rocket.chat/core-typings';
import { isRegisterUser } from '@rocket.chat/core-typings';
import { Avatars, Messages, Rooms } from '@rocket.chat/models';
import { api } from '@rocket.chat/core-services';

import { RocketChatFile } from '../../../file/server';
import { settings } from '../../../settings/server';
import { FileUpload } from '../../../file-upload/server';

export const setRoomAvatar = async function (rid: string, dataURI: string, user: IUser): Promise<void> {
	if (!isRegisterUser(user)) {
		throw new Meteor.Error('invalid-user', 'Invalid user', {
			function: 'RocketChat.setRoomAvatar',
		});
	}

	const fileStore = FileUpload.getStore('Avatars');

	const current = await Avatars.findOneByRoomId(rid);

	if (!dataURI) {
		fileStore.deleteByRoomId(rid);
		await Messages.createWithTypeRoomIdMessageUserAndUnread(
			'room_changed_avatar',
			rid,
			'',
			user,
			settings.get('Message_Read_Receipt_Enabled'),
		);
		void api.broadcast('room.avatarUpdate', { _id: rid });
		await Rooms.unsetAvatarData(rid);
		return;
	}

	const fileData = RocketChatFile.dataURIParse(dataURI);

	const buffer = Buffer.from(fileData.image, 'base64');

	const file = {
		rid,
		type: fileData.contentType,
		size: buffer.length,
		uid: user._id,
	};

	if (current) {
		fileStore.deleteById(current._id);
	}

	fileStore.insert(file, buffer, (err: unknown, result: { etag: string }) => {
		if (err) {
			throw err;
		}

		Meteor.setTimeout(async function () {
			await Rooms.setAvatarData(rid, 'upload', result.etag);
			await Messages.createWithTypeRoomIdMessageUserAndUnread(
				'room_changed_avatar',
				rid,
				'',
				user,
				settings.get('Message_Read_Receipt_Enabled'),
			);
			void api.broadcast('room.avatarUpdate', { _id: rid, avatarETag: result.etag });
		}, 500);
	});
};
