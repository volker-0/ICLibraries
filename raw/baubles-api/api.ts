enum BaubleType {
    amulet = "amulet",
    ring = "ring",
    belt = "belt",
    head = "head",
    body = "body",
    charm = "charm"
}

interface BaublesData {
    [id: number]: { container: ItemContainer, cache: any }
}

class Baubles {
    static btnContainer = new UI.Container();
    static descriptions: { [id: number]: BaubleDescription } = {};
    static data: BaublesData = {};

    static registerBauble(obj: BaubleDescription) {
        if (!obj.onEquip) {
            obj.onEquip = () => {
            };
        }

        if (!obj.onTakeOff) {
            obj.onTakeOff = () => {
            };
        }

        if (!obj.tick) {
            obj.tick = () => {
            };
        }
        this.descriptions[obj.id] = obj;
    }

    static setupClientSide() {
        ItemContainer.registerScreenFactory("baubles.ui",
            (container, name) => name === "main" ? GUI : null);
    }

    static setupServerSide() {
        Network.addServerPacket("baubles.open_ui",
            (client) => this.openGuiFor(client));
    }

    static setupContainer(playerUid: number, container: ItemContainer = new ItemContainer()) {
        container.setClientContainerTypeName("baubles.ui");

        const slots = ["amulet", "ring0", "ring1", "belt", "head", "body", "charm"];
        for (const name of slots) {
            container.setDirtySlotListener(name, (container, name, slot) => {
                const data = Baubles.data[playerUid];
                const old = data.cache[name];
                if (!old && slot.id > 0 || slot.id !== old) {
                    const client = Network.getClientForPlayer(playerUid);
                    if (old) {
                        Baubles.getDesc(old.id)?.onTakeOff(client, data.container, name);
                    }
                    Baubles.getDesc(slot.id)?.onEquip(client, data.container, name);
                    data.cache[name] = slot.id;
                }
            });

            container.setSlotAddTransferPolicy(name, (container, name, id, amount) => {
                const baubleType = name === "ring0" || name === "ring1" ? "ring" : name;
                return Baubles.getType(id) === baubleType ?
                    Math.min(amount, Item.getMaxStack(id) - container.getSlot(name).count) : 0;
            });
        }

        return container;
    }

    static getContainer(client: NetworkClient) {
        const uid = client.getPlayerUid();
        let bauble = this.data[uid];
        if (!bauble) {
            bauble = this.data[uid] = {
                container: this.setupContainer(client.getPlayerUid()),
                cache: {},
            };
        }

        return bauble.container;
    }

    static tick() {
        for (const uid in Baubles.data) {
            const client = Network.getClientForPlayer(parseInt(uid));
            if (!client) {
                continue;
            }

            const data = Baubles.data[uid];
            const cache = data.cache;
            for (const slot in cache) {
                Baubles.getDesc(cache[slot])
                    ?.tick(client, data.container, slot);
            }
        }
    }

    static openGui() {
        Network.sendToServer("baubles.open_ui", {});
    }

    static openGuiFor(client: NetworkClient) {
        Baubles.getContainer(client)
            .openFor(client, "main");
    }

    static getDesc(id: number) {
        return this.descriptions[id] || null;
    }

    static getType(id: number): BaubleType {
        let desc = this.descriptions[id];

        if (!desc) {
            return null;
        }

        return desc.type;
    }

    static reset() {
        Baubles.data = {};
    }

    static getDataFor(playerUid: number) {
        return this.data[playerUid] || null;
    }
}

Baubles.setupClientSide();
Baubles.setupServerSide();

Callback.addCallback("tick", () => Baubles.tick());

Callback.addCallback("LevelLeft", () => Baubles.reset());

Callback.addCallback("EntityDeath", (entity: number) => {
    if (Entity.getType(entity) === 1) { //player
        const data = Baubles.getDataFor(entity);
        if (!data) {
            return;
        }

        const client = Network.getClientForPlayer(entity);
        if (!client) {
            return;
        }

        const pos = Entity.getPosition(entity);
        const blockSource = BlockSource.getDefaultForActor(entity);
        const container = data.container;
        for (let i in data.cache) {
            const bauble = data.cache[i];
            if (bauble.onTakeOff) {
                bauble.onTakeOff(client, data.container, i);
            }
            container.dropSlot(blockSource, i, pos.x, pos.y, pos.z);
        }
    }
});

Callback.addCallback("ServerPlayerLoaded", (player: number) => {
    const client = Network.getClientForPlayer(player);
    if (!client) {
        return;
    }

    const data = Baubles.getDataFor(client.getPlayerUid());
    if (!data) {
        return;
    }

    const cache = data.cache;
    for (let slot in cache) {
        const desc = Baubles.getDesc(cache[slot]);
        if (!desc) {
            continue;
        }

        desc.onEquip(client, data.container, slot);
    }
});

Callback.addCallback("NativeGuiChanged", (screenName: string) => {
    if (screenName === "inventory_screen_pocket" || screenName === "inventory_screen") {
        Baubles.btnContainer.openAs(BUTTON_GUI);
    } else {
        Baubles.btnContainer.close();
    }
});

EXPORT("Baubles", Baubles);
EXPORT("BaubleType", BaubleType);