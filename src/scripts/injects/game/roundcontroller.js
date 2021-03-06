var RoundController = Classy.newClass(); // eslint-disable-line no-var

RoundController.fields({
    model: null,
    localPlayerIds: [],
    gameMode: null,
    id: null,

    initialRoundStateReceived: false,
    initialRoundStateSent: false,
    tankStateEmissionValue: 0.0,
    
    log: null
});

RoundController.constructor(function(localPlayerIds, gameMode, gameId)  {
    this.id = IdGenerator.instance.gen('rc');
    this.localPlayerIds = localPlayerIds;
    this.gameMode = gameMode;
    this.log = Log.create('RoundController');
    this.model = RoundModel.create(this.id, new Box2D.Dynamics.b2World(new Box2D.Common.Math.b2Vec2(0, 0), true));
    // We only want to handle events generated by the model when we are not
    // receiving instructions from the outside (ie. only if we are in local mode,
    // or in server mode)
    // We also only want to register the round controller on the game mode in this case.
    if (Constants.getMode() === Constants.MODE_SERVER || Constants.getMode() === Constants.MODE_CLIENT_LOCAL) {
        this.model.addEventListener(this._modelEventHandler, this, gameId);

        // Store reference to this new round controller.
        this.gameMode.setRoundController(this);
    }
});


RoundController.methods({

    _modelEventHandler: function(self, id, evt, data) {
        switch (evt) {
            case RoundModel._EVENTS.ROUND_CREATED:
            case RoundModel._EVENTS.MAZE_SET:
            case RoundModel._EVENTS.ROUND_STARTED:
            case RoundModel._EVENTS.ROUND_ENDED:
            case RoundModel._EVENTS.CELEBRATION_STARTED:
            case RoundModel._EVENTS.CELEBRATION_ENDED:
            case RoundModel._EVENTS.PROJECTILE_TIMEOUT:
            case RoundModel._EVENTS.PROJECTILE_CREATED:
            case RoundModel._EVENTS.PROJECTILE_DESTROYED:
            case RoundModel._EVENTS.COLLECTIBLE_CREATED:
            case RoundModel._EVENTS.COLLECTIBLE_DESTROYED:
            case RoundModel._EVENTS.TANK_CREATED:
            case RoundModel._EVENTS.TANK_DESTROYED:
            case RoundModel._EVENTS.TANK_KILLED:
            case RoundModel._EVENTS.WEAPON_CREATED:
            case RoundModel._EVENTS.WEAPON_DESTROYED:
            case RoundModel._EVENTS.UPGRADE_CREATED:
            case RoundModel._EVENTS.UPGRADE_DESTROYED:
            case RoundModel._EVENTS.COUNTER_CREATED:
            case RoundModel._EVENTS.COUNTER_DESTROYED:
            case RoundModel._EVENTS.ZONE_CREATED:
            case RoundModel._EVENTS.ZONE_DESTROYED:
            case Weapon._EVENTS.WEAPON_FIRED:
            case Weapon._EVENTS.HOMING_MISSILE_TARGET_CHANGED:
            case Upgrade._EVENTS.UPGRADE_ACTIVATED:
            case Upgrade._EVENTS.UPGRADE_WEAKENED:
            case Upgrade._EVENTS.UPGRADE_STRENGTHENED:
            case Zone._EVENTS.ZONE_ENTERED:
            case Zone._EVENTS.ZONE_LEFT:
            case Zone._EVENTS.ZONE_DESTABILIZED:
            case RoundModel._EVENTS.TANK_TANK_COLLISION:
            case RoundModel._EVENTS.TANK_MAZE_COLLISION:
            case RoundModel._EVENTS.TANK_SHIELD_COLLISION:
            case RoundModel._EVENTS.SHIELD_SHIELD_COLLISION:
            {
                // Intentionally left blank
                break;
            }
            case RoundModel._EVENTS.SHIELD_ZONE_COLLISION:
            {
                switch(data.zone.getType()) {
                    case Constants.ZONE_TYPES.SPAWN:
                    {
                        const upgradeUpdate = UpgradeUpdate.create(data.shieldA.getId(), data.shieldA.getPlayerId());
                        self.destroyUpgrade(upgradeUpdate);
                        break;
                    }
                }
                break;
            }
            case RoundModel._EVENTS.PROJECTILE_SHIELD_COLLISION:
            {
                data.projectile.hitShield();
                break;
            }
            case RoundModel._EVENTS.PROJECTILE_ZONE_COLLISION:
            {
                switch(data.zone.getType()) {
                    case Constants.ZONE_TYPES.SPAWN:
                    {
                        self.destroyProjectile(data.projectile.getId());
                        break;
                    }
                }
                break;
            }
            case RoundModel._EVENTS.PROJECTILE_MAZE_COLLISION:
            {
                data.projectile.hitMaze();
                break;
            }
            case RoundModel._EVENTS.TANK_COLLECTIBLE_COLLISION:
            {
                const pickup = Pickup.create(data.tankA.getPlayerId(), data.collectible.getId(), data.collectible.getType());

                // Check that tank has room to pick up crate.
                if (data.collectible.getType() < Constants.COLLECTIBLE_TYPES.WEAPON_CRATE_COUNT) {
                    if (self.getQueuedWeapons(data.tankA.getPlayerId()).length < Constants.MAX_WEAPON_QUEUE) {
                        self.pickUpCrate(pickup);
                        self.destroyCollectible(pickup);
                    }
                } else if (data.collectible.getType() < Constants.COLLECTIBLE_TYPES.UPGRADE_CRATE_COUNT) {
                    if (!self.getUpgradeByPlayerIdAndType(data.tankA.getPlayerId(), data.collectible.getType() + Constants.COLLECTIBLE_TYPES.COLLECTIBLE_TO_UPGRADE_OFFSET)) {
                        self.pickUpCrate(pickup);
                        self.destroyCollectible(pickup);
                    }
                } else {
                    self.destroyCollectible(pickup);
                }
                break;
            }
            case RoundModel._EVENTS.TANK_DEADLY_COLLISION:
            {
                let killExperience = 0;
                if (data.tankA.getPlayerId() !== data.projectile.getPlayerId()) {
                    killExperience = self.gameMode.getKillExperience();
                }

                const kill = Kill.create(data.tankA.getPlayerId(), data.projectile.getPlayerId(), killExperience, data.projectile.getId(), data.projectile.getType());
                self.killTank(kill);
                self.destroyProjectile(data.projectile.getId());
                break;
            }
            case RoundModel._EVENTS.TANK_ZONE_COLLISION:
            {
                switch(data.zone.getType()) {
                    case Constants.ZONE_TYPES.SPAWN:
                    {
                        self.destroyTank(data.tankA.getPlayerId());
                        break;
                    }
                }
                break;
            }
            case RoundModel._EVENTS.TANK_CHICKENED_OUT:
            {
                // A player disconnected while he was alive in a round that was in progress
                // Intentionally do nothing here
                break;
            }
            default:
            {
                self.log.error("Unknown event received by RoundController._modelEventHandler: " + evt);
            }
        }
    },

    removeTank: function(playerId) {
        return this.model.removeTank(playerId);
    },

    setMaze: function(maze) {
        this.model.setMaze(maze);
    },

    // CLIENT ONLY.
    setRoundState: function(roundState) {
        //Iterate over tanks, projectiles, etc., and call setTankState, and setProjectileState etc.
        const tankStates = roundState.getTankStates();
        for (let i = 0;i<tankStates.length;i++) {
            // If online client and the player id is my player id, ignore the tank state.
            // Except if the tank is not present (it has spawned). Since, we use websockets we are guaranteed that a round state containing a previously destroyed tank will never show up after the tank destruction message.
            if (Constants.getMode() != Constants.MODE_CLIENT_ONLINE || this.localPlayerIds.indexOf(tankStates[i].getPlayerId()) == -1 || this.model.getTanks()[tankStates[i].getPlayerId()] === undefined) {
                this.setTankState(tankStates[i], false);
            }
        }

        const projectileStates = roundState.getProjectileStates();
        for (let i = 0;i<projectileStates.length;i++) {
            this.setProjectileState(projectileStates[i]);
        }

        const collectibleStates = roundState.getCollectibleStates();
        for (let i = 0;i<collectibleStates.length;i++) {
            this.setCollectibleState(collectibleStates[i]);
        }

        const weaponStates = roundState.getWeaponStates();
        for (let i = 0;i<weaponStates.length;i++) {
            this.setWeaponState(weaponStates[i]);
        }

        const upgradeStates = roundState.getUpgradeStates();
        for (let i = 0;i<upgradeStates.length;i++) {
            this.setUpgradeState(upgradeStates[i]);
        }

        const counterStates = roundState.getCounterStates();
        for (let i = 0;i<counterStates.length;i++) {
            this.setCounterState(counterStates[i]);
        }

        const zoneStates = roundState.getZoneStates();
        for (let i = 0;i<zoneStates.length;i++) {
            this.setZoneState(zoneStates[i]);
        }

        this.initialRoundStateReceived = true;
    },

    getRoundState: function(expandedState) {
        expandedState |= !this.initialRoundStateSent;
        const roundState = this.model.getRoundState(expandedState);

        return roundState;
    },
    
    clearExpandedRoundStateBits: function() {
        this.initialRoundStateSent = true;
        this.model.clearExpandedRoundStateBits();
    },
    
    verifyAndCorrectTankState: function(tankState) {
        // Do some verification of the tank state - only used in server mode.
        const tank = this.getTank(tankState.getPlayerId());

        if (!tank) {
            return false;
        }

        // Keeps tabs of whether or not the state was modified because it was invalid.
        // If it is modified, signal that the client's state should be overwritten by the server's modified state.
        let stateVerified = true;

        if (isNaN(tankState.getX()) || isNaN(tankState.getY())) {
            this.log.error("Received NaN tank position in tank state");
            // Client's position is not valid.
            tankState.setX(tank.getX());
            tankState.setY(tank.getY());
            stateVerified = false;
        }

        const positionDiff = Box2D.Common.Math.b2Vec2.Make(tank.getX() - tankState.getX(), tank.getY() - tankState.getY());
        if (positionDiff.LengthSquared() > Constants.SERVER.MAX_ACCEPTED_POSITION_DIFF_SQUARED) {
            // Client's position needs to be corrected.
            // FIXME Perhaps set the position to extrapolated version based on client's latency.
            tankState.setX(tank.getX());
            tankState.setY(tank.getY());
            stateVerified = false;
        }
        const rotationDiff = tank.getRotation() - tankState.getRotation();
        if (Math.abs(rotationDiff) > Constants.SERVER.MAX_ACCEPTED_ROTATION_DIFF) {
            // Client's rotation needs to be corrected.
            // FIXME Perhaps set the rotation to extrapolated version based on client's latency.
            tankState.setRotation(tank.getRotation());
            stateVerified = false;
        }

        const maze = this.getMaze();
        if (maze) {
            if (!maze.isTankStateInsideMaze(tankState)) {
                // Client's position needs to be corrected.
                tankState.setX(tank.getX());
                tankState.setY(tank.getY());
                stateVerified = false;
            }
        }
        
        return stateVerified;
    },

    // CLIENT AND SERVER.
    setTankState: function(tankState, initial) {
        // Only do game logic if local client or server.
        if (Constants.getMode() === Constants.MODE_CLIENT_LOCAL || Constants.getMode() === Constants.MODE_SERVER) {

            // Check that tank is still alive.
            const tank = this.getTank(tankState.getPlayerId());
            if (!tank && !initial) {
                return;
            }
            
            this.model.setTankState(tankState);
        } else {
            this.model.setTankState(tankState);
        }

        // Update weapons on both client and server side.
        this._updateWeaponLockingAndFiring();
    },

    setProjectileState: function(projectileState) {
        this.model.setProjectileState(projectileState);
    },

    setCollectibleState: function(collectibleState) {
        this.model.setCollectibleState(collectibleState);
    },

    setWeaponState: function(weaponState) {
        this.model.setWeaponState(weaponState);
    },

    setUpgradeState: function(upgradeState) {
        this.model.setUpgradeState(upgradeState);
    },

    setCounterState: function(counterState) {
        this.model.setCounterState(counterState);
    },

    setZoneState: function(zoneState) {
        this.model.setZoneState(zoneState);
    },

    setInputState: function(inputState) {
        // Disable input if round is not started or maze was not yet received.
        if (!this.model.getStarted() || !this.model.getMaze()) {
            return;
        }
        
        const playerId = inputState.getPlayerId();
        const tank = this.getTank(playerId);
        if (tank) {
            const tankState = TankState.withState(
                playerId,
                tank.getX(),
                tank.getY(),
                inputState.getForward(),
                inputState.getBack(),
                tank.getRotation(),
                inputState.getLeft(),
                inputState.getRight(),
                inputState.getFire(),
                tank.getLocked()
            );

            this.setTankState(tankState, false);
            
            if (Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
                this.tankStateEmissionValue = 0.0;
                this.model.emitTankState(tankState);
            }
        }
    },
    
    createRound: function(ranked) {
        this.model.createRound(ranked);
    },
    
    startRound: function() {
        // If local client, we never receive an initial round state so set this to true to make UI work.
        if (Constants.getMode() === Constants.MODE_CLIENT_LOCAL) {
            this.initialRoundStateReceived = true;
        }

        this.model.startRound();
    },
    
    endRound: function(victoryAward) {
        this.model.endRound(victoryAward);
        // Reset state.
        this.initialRoundStateReceived = false;
    },

    startCelebration: function() {
        this.model.startCelebration();
    },

    endCelebration: function() {
        this.model.endCelebration();
    },

    // CLIENT AND SERVER.
    pullTrigger: function(playerId) {
        const tank = this.getTank(playerId);
        if (tank) {
            const weapon = this.getActiveWeapon(playerId);
            if (weapon) {
                // Fire correct weapon according to tank's current weapon.
                if (weapon.fire()) {
                    // Only do game logic if local client or server.
                    if (Constants.getMode() === Constants.MODE_CLIENT_LOCAL || Constants.getMode() === Constants.MODE_SERVER) {
                        // Add the weapon's projectiles.
                        const projectileStates = weapon.getProjectileStates(tank);
                        for (let i = 0; i < projectileStates.length; ++i) {
                            this.setProjectileState(projectileStates[i]);
                        }
                    }
                }
            }
        }
    },
    
    // CLIENT AND SERVER.
    releaseTrigger: function(playerId) {
        const tank = this.getTank(playerId);
        if (tank) {
            const weapon = this.getActiveWeapon(playerId);
            if (weapon) {
                weapon.release();
            }
        }        
    },
    
    // SERVER ONLY.
    timeoutProjectile: function(projectileId) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.timeoutProjectile(projectileId);
        } else {
            this.log.error("Attempt to timeout projectile while round was not started");
        }
    },
    
    destroyProjectile: function(projectileId) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.destroyProjectile(projectileId);
        } else {
            this.log.error("Attempt to destroy projectile while round was not started");
        }
    },

    destroyCollectible: function(pickup) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.destroyCollectible(pickup);
        } else {
            this.log.error("Attempt to destroy collectible while round was not started");
        }
    },

    destroyWeapon: function(weaponDeactivation) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.destroyWeapon(weaponDeactivation);
        } else {
            this.log.error("Attempt to destroy weapon while round was not started");
        }
    },

    destroyUpgrade: function(upgradeUpdate) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.destroyUpgrade(upgradeUpdate);
        } else {
            this.log.error("Attempt to destroy upgrade while round was not started");
        }
    },

    destroyCounter: function(counterId) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.destroyCounter(counterId);
        } else {
            this.log.error("Attempt to destroy counter while round was not started");
        }
    },

    destroyZone: function(zoneId) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.destroyZone(zoneId);
        } else {
            this.log.error("Attempt to destroy zone while round was not started");
        }
    },

    killTank: function(kill) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.killTank(kill);
        } else {
            this.log.error("Attempt to kill tank while round was not started");
        }
    },

    destroyTank: function(playerId) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            this.model.destroyTank(playerId);
        } else {
            this.log.error("Attempt to destroy tank while round was not started");
        }
    },

    // Server or game mode.
    spawnTank: function(playerId, position, respawn) {
        const tankState = TankState.withState(
            playerId,
            position.x,
            position.y,
            false,
            false,
            position.rotation,
            false,
            false,
            false,
            false
        );

        this.setTankState(tankState, true);

        let weaponState = null;
        let upgradeState = null;
        if (respawn) {
            weaponState = this.gameMode.getRespawnWeaponState(tankState.getPlayerId());
            upgradeState = this.gameMode.getRespawnUpgradeState(tankState.getPlayerId());
        } else {
            weaponState = this.gameMode.getInitialWeaponState(tankState.getPlayerId());
            upgradeState = this.gameMode.getInitialUpgradeState(tankState.getPlayerId());
        }
        if (weaponState) {
            this.setWeaponState(weaponState);
        }
        if (upgradeState) {
            this.setUpgradeState(upgradeState);
        }
    },

    // FIXME Move entirely into game mode?
    // Game mode.
    spawnCrate: function(type, position) {
        const collectibleState = CollectibleState.withState(
            IdGenerator.instance.gen('c'),
            type,
            position.x,
            position.y,
            position.rotation
        );

        this.setCollectibleState(collectibleState);
    },

    // FIXME Move entirely into game mode?
    pickUpCrate: function(pickup) {
        if (this.model.getStarted() || Constants.getMode() == Constants.MODE_CLIENT_ONLINE) {
            let weaponState = null;
            let upgradeState = null;

            const collectible = this.getCollectible(pickup.getCollectibleId());
            if (collectible) {
                switch(collectible.getType()) {
                    case Constants.COLLECTIBLE_TYPES.CRATE_LASER:
                    {
                        weaponState = LaserWeapon.createInitialWeaponState(
                            IdGenerator.instance.gen('lw'),
                            pickup.getPlayerId());

                        upgradeState = LaserAimerUpgrade.createInitialUpgradeState(
                            IdGenerator.instance.gen('lau'),
                            pickup.getPlayerId(),
                            weaponState.getId(),
                            Constants.LASER_AIMER_LENGTH);

                        break;
                    }
                    case Constants.COLLECTIBLE_TYPES.CRATE_DOUBLE_BARREL:
                    {
                        weaponState = DoubleBarrelWeapon.createInitialWeaponState(
                            IdGenerator.instance.gen('dbw'),
                            pickup.getPlayerId(),
                            Constants.DOUBLE_BARREL_AMMO_COUNT);

                        break;
                    }
                    case Constants.COLLECTIBLE_TYPES.CRATE_SHOTGUN:
                    {
                        weaponState = ShotgunWeapon.createInitialWeaponState(
                            IdGenerator.instance.gen('sw'),
                            pickup.getPlayerId(),
                            Constants.SHOTGUN_AMMO_COUNT);

                        break;
                    }
                    case Constants.COLLECTIBLE_TYPES.CRATE_HOMING_MISSILE:
                    {
                        weaponState = HomingMissileWeapon.createInitialWeaponState(
                            IdGenerator.instance.gen('hmw'),
                            pickup.getPlayerId());

                        break;
                    }
                    case Constants.COLLECTIBLE_TYPES.CRATE_AIMER:
                    {
                        upgradeState = AimerUpgrade.createInitialUpgradeState(
                            IdGenerator.instance.gen('au'),
                            pickup.getPlayerId(),
                            Constants.AIMER_LIFETIME,
                            Constants.AIMER_LENGTH);

                        break;
                    }
                    case Constants.COLLECTIBLE_TYPES.CRATE_SHIELD:
                    {
                        upgradeState = ShieldUpgrade.createInitialUpgradeState(
                            IdGenerator.instance.gen('su'),
                            pickup.getPlayerId(),
                            Constants.SHIELD_LIFETIME);

                        break;
                    }
                    case Constants.COLLECTIBLE_TYPES.CRATE_SPEED_BOOST:
                    {
                        upgradeState = SpeedBoostUpgrade.createInitialUpgradeState(
                            IdGenerator.instance.gen('sbu'),
                            pickup.getPlayerId(),
                            Constants.SPEED_BOOST_LIFETIME,
                            Constants.SPEED_BOOST_EFFECT);

                        break;
                    }
                }

                if (weaponState) {
                    this.setWeaponState(weaponState);
                }

                if (upgradeState) {
                    this.setUpgradeState(upgradeState);
                }

            } else {
                this.log.error("Attempt to pick up crate which was not there");
            }
        } else {
            this.log.error("Attempt to pick up crate while round was not started");
        }
    },

    spawnGold: function() {
        // Check if max number of gold spawns for this round has been reached.
        if (this.model.getGoldSpawnCount() < Constants.SERVER.GOLD_SPAWN_MAX_PER_ROUND) {
            // Check if there is more than one tank left in the round.
            if (this.model.getTankCount() > 1) {
                // Check if there are already max number of simultaneous golds in the round.
                if (this.getCollectibleCount(Constants.COLLECTIBLE_TYPES.GOLD) < Constants.MAX_GOLDS) {
                    const goldPosition = this.model.getMaze().getRandomUnusedPosition(this.getRoundState(), Constants.GOLD_MINIMUM_TILES_TO_TANKS);
                    if (goldPosition) {

                        const collectibleState = CollectibleState.withState(
                            IdGenerator.instance.gen('g'),
                            Constants.COLLECTIBLE_TYPES.GOLD,
                            goldPosition.x,
                            goldPosition.y,
                            0
                        );

                        this.setCollectibleState(collectibleState);
                    } 
                }
            }
        }
    },

    spawnDiamond: function() {
        // Check if max number of diamond spawns for this round has been reached.
        if (this.model.getDiamondSpawnCount() < Constants.SERVER.DIAMOND_SPAWN_MAX_PER_ROUND) {
            // Check if there is more than one tank left in the round.
            if (this.model.getTankCount() > 1) {
                // Check if there are already max number of simultaneous diamonds in the round.
                if (this.getCollectibleCount(Constants.COLLECTIBLE_TYPES.DIAMOND) < Constants.MAX_DIAMONDS) {
                    const diamondPosition = this.model.getMaze().getRandomUnusedPosition(this.getRoundState(), Constants.DIAMOND_MINIMUM_TILES_TO_TANKS);
                    if (diamondPosition) {

                        const collectibleState = CollectibleState.withState(
                            IdGenerator.instance.gen('d'),
                            Constants.COLLECTIBLE_TYPES.DIAMOND,
                            diamondPosition.x,
                            diamondPosition.y,
                            -Math.PI * 0.25 + Math.random() * 0.5 * Math.PI
                        );

                        this.setCollectibleState(collectibleState);
                    }
                }
            }
        }
    },

    _updateWeaponLockingAndFiring: function() {
        // Lock movement on both client and server side.
        const tanks = this.model.getTanks();
        for (const tank in tanks) {
            const weapon = this.getActiveWeapon(tanks[tank].getPlayerId());
            if (weapon) {
                tanks[tank].setLocked(weapon.movementLocked());
            }
        }

        // Pull and release trigger on both client and server side.
        for (const tank in tanks) {
            if (tanks[tank].getFireDown()) {
                this.pullTrigger(tanks[tank].getPlayerId());
            } else {
                this.releaseTrigger(tanks[tank].getPlayerId());
            }            
        }
    },

    update: function(deltaTime) {
        // Update weapons on both client and server side.
        this._updateWeaponLockingAndFiring();

        // Only do game logic if local client or server.
        if (Constants.getMode() === Constants.MODE_CLIENT_LOCAL || Constants.getMode() === Constants.MODE_SERVER)
        {
            // Enable logic only if round is started and maze was created.
            if (this.model.getStarted() && this.model.getMaze()) {
                
                // Time out projectiles.
                const projectiles = this.model.getProjectiles();
                for (const projectile in projectiles) {
                    if (projectiles[projectile].done()) {
                        this.model.timeoutProjectile(projectiles[projectile].getId());
                    }                 
                }

                // Check whether weapons are done
                const weapons = this.model.getWeapons();
                for (const weapon in weapons) {
                    if (weapons[weapon].done()) {
                        const weaponDeactivation = WeaponDeactivation.create(weapons[weapon].getId(), weapons[weapon].getPlayerId());
                        this.destroyWeapon(weaponDeactivation);
                    }
                }

                // Check whether upgrades are done
                const upgrades = this.model.getUpgrades();
                for (const upgrade in upgrades) {
                    if (upgrades[upgrade].done()) {
                        const upgradeUpdate = UpgradeUpdate.create(upgrades[upgrade].getId(), upgrades[upgrade].getPlayerId());
                        this.destroyUpgrade(upgradeUpdate);
                    }
                }

                // Check whether counters are done
                const counters = this.model.getCounters();
                for (const counter in counters) {
                    if (counters[counter].done()) {
                        this.destroyCounter(counters[counter].getId());
                    }
                }

                // Check whether zones are done
                const zones = this.model.getZones();
                for (const zone in zones) {
                    if (zones[zone].done()) {
                        this.destroyZone(zones[zone].getId());
                    }
                }

                // Update game mode logic.
                this.gameMode.update(deltaTime);
                
                // Check whether round has ended
                if (this.gameMode.isRoundOver()) {
                    // Figure out if anyone won.
                    const winnerPlayerIds = this.gameMode.getWinnerPlayerIds();

                    let victoryExperiencePerWinner = 0;
                    if (winnerPlayerIds.length > 0) {
                        victoryExperiencePerWinner = Math.ceil(this.gameMode.getVictoryExperience() / winnerPlayerIds.length);
                    }

                    let victoryGoldAmountPerWinner = 0;
                    if (winnerPlayerIds.length > 0) {
                        victoryGoldAmountPerWinner = Math.ceil(this.model.getVictoryGoldAmount() / winnerPlayerIds.length);
                    }

                    const rankChanges = this.model.getRankChanges(winnerPlayerIds);

                    this.endRound(VictoryAward.create(winnerPlayerIds, victoryExperiencePerWinner, victoryGoldAmountPerWinner, rankChanges));
                }
            }
        } else {
            // Only emit my tank state if online client.
            if (this.model.getStarted()) {
                this.tankStateEmissionValue += deltaTime;
                if (this.tankStateEmissionValue >= Constants.CLIENT.TANKSTATE_EMISSION_INTERVAL) {
                    this.tankStateEmissionValue = 0.0;
                    for (let i = 0; i < this.localPlayerIds.length; ++i) {
                        const tank = this.getTank(this.localPlayerIds[i]);
                        if (tank) {
                            this.model.emitTankState(tank.getTankState());
                        }
                    }
                }
            }
        }

        // Update model.
        this.model.update(deltaTime);
    },
    
    addEventListener: function(callback, context, gameId) {
        this.model.addEventListener(callback, context, gameId);
    },

    removeEventListener: function(callback, context) {
        this.model.removeEventListener(callback, context);
    },

    getId: function() {
        return this.id;
    },

    getTank: function (playerId) {
        return this.model.getTank(playerId);
    },

    getTanks: function () {
        return this.model.getTanks();
    },

    getProjectile: function (projectileId) {
        return this.model.getProjectile(projectileId);
    },

    getProjectiles: function() {
        return this.model.getProjectiles();
    },

    getCollectible: function(collectibleId) {
        return this.model.getCollectible(collectibleId);
    },

    getCollectibles: function() {
        return this.model.getCollectibles();
    },

    getCrateCount: function() {
        return this.model.getCrateCount();
    },

    getCollectibleCount: function(collectibleType) {
        return this.model.getCollectibleCount(collectibleType);
    },
    
    getActiveWeapon: function(playerId) {
        return this.model.getActiveWeapon(playerId);
    },

    getDefaultWeapon: function(playerId) {
        return this.model.getDefaultWeapon(playerId);
    },

    getQueuedWeapons: function(playerId) {
        return this.model.getQueuedWeapons(playerId);
    },

    getUpgrades: function() {
        return this.model.getUpgrades();
    },

    getUpgrade: function(upgradeId) {
        return this.model.getUpgrade(upgradeId);
    },

    getUpgradeByPlayerIdAndType: function(playerId, upgradeType) {
        return this.model.getUpgradeByPlayerIdAndType(playerId, upgradeType);
    },

    getCounters: function() {
        return this.model.getCounters();
    },

    getCounter: function(counterId) {
        return this.model.getCounter(counterId);
    },

    getZones: function() {
        return this.model.getZones();
    },

    getZone: function(zoneId) {
        return this.model.getZone(zoneId);
    },

    getMaze: function() {
        return this.model.getMaze();
    },

    // SERVER ONLY
    setVictoryGoldAmount: function(victoryGoldAmount) {
        this.model.setVictoryGoldAmount(victoryGoldAmount);
    },

    setStakes: function(stakes) {
        this.model.setStakes(stakes);
    },

    getStake: function(playerId) {
        return this.model.getStake(playerId);
    },

    getInitialRoundStateReceived: function() {
        return this.initialRoundStateReceived;
    },

    getB2DWorld: function() {
        return this.model.getB2DWorld();
    }
});

if (typeof module === 'object') {
    module.exports = RoundController;
}
