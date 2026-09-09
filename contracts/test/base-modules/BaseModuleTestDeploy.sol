// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Vm } from "forge-std/Vm.sol";
import { BaseFactoryAdminModule } from "../../contracts/base-modules/BaseFactoryAdminModule.sol";
import { BaseFactoryCreateModule } from "../../contracts/base-modules/BaseFactoryCreateModule.sol";
import { BaseFactoryLifecycleModule } from "../../contracts/base-modules/BaseFactoryLifecycleModule.sol";
import { BaseFactoryOracleModule } from "../../contracts/base-modules/BaseFactoryOracleModule.sol";

/// @dev Test deployments enforce real Base runtime/initcode limits on each creation.
library BaseModuleTestDeploy {
    function deploy(bytes memory code) internal returns (address deployed) {
        require(code.length <= 49152, "Base initcode limit");
        assembly ("memory-safe") { deployed := create(0, add(code, 32), mload(code)) }
        require(deployed != address(0), "module creation failed");
        require(deployed.code.length <= 24576, "Base runtime limit");
    }
    function pool(Vm vm) internal returns (address) {
        address admin = deploy(vm.getCode("BasePoolAdminModule.sol:BasePoolAdminModule"));
        address deposits = deploy(vm.getCode("BasePoolDepositsModule.sol:BasePoolDepositsModule"));
        address fees = deploy(vm.getCode("BasePoolFeesModule.sol:BasePoolFeesModule"));
        address initialize = deploy(vm.getCode("BasePoolInitializeModule.sol:BasePoolInitializeModule"));
        address partialexit = deploy(vm.getCode("BasePoolPartialExitModule.sol:BasePoolPartialExitModule"));
        address protector = deploy(vm.getCode("BasePoolProtectorModule.sol:BasePoolProtectorModule"));
        address shieldexit = deploy(vm.getCode("BasePoolShieldExitModule.sol:BasePoolShieldExitModule"));
        address views = deploy(vm.getCode("BasePoolViewsModule.sol:BasePoolViewsModule"));
        return deploy(bytes.concat(vm.getCode("BasePoolRouter.sol:BasePoolRouter"), abi.encode(admin, deposits, fees, initialize, partialexit, protector, shieldexit, views)));
    }
    function factory(Vm vm) internal returns (address) {
        address admin = deploy(type(BaseFactoryAdminModule).creationCode);
        address create = deploy(type(BaseFactoryCreateModule).creationCode);
        address lifecycle = deploy(type(BaseFactoryLifecycleModule).creationCode);
        address oracle = deploy(type(BaseFactoryOracleModule).creationCode);
        address views = deploy(vm.getCode("BaseFactoryViewsModule.sol:BaseFactoryViewsModule"));
        return deploy(bytes.concat(vm.getCode("BaseFactoryRouter.sol:BaseFactoryRouter"), abi.encode(admin, create, lifecycle, oracle, views)));
    }
}
