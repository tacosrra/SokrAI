ALTER TABLE module_chats
    DROP CONSTRAINT IF EXISTS module_chats_chat_status_check;

ALTER TABLE module_chats
    ADD CONSTRAINT module_chats_chat_status_check
    CHECK (
        chat_status IN (
            'not_started',
            'preparing',
            'active',
            'waiting_for_user',
            'ready_to_generate',
            'completed',
            'blocked',
            'failed'
        )
    );
